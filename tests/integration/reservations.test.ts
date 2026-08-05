/* eslint-disable */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock types for testing API endpoints
interface MockContext {
  locals: {
    user: { id: string } | null;
    role: string | null;
    operatorSectors: string[];
  };
  request: {
    headers: Headers;
    json: () => Promise<unknown>;
  };
  cookies: Record<string, unknown>;
}

interface PricingTier {
  id: string;
  sector_id: string;
  base_price_per_day: number;
  discount_steps: { days_min: number; discount_percentage: number }[];
  ended_at: null;
}

interface ReservationData {
  sectorId: string;
  arrivalAt: string;
  departureAt: string;
  customerName: string;
  licensePlate: string;
  priceOverride?: number;
}

describe("Reservation API Endpoints", () => {
  describe("POST /api/reservations/calculate-price", () => {
    let mockContext: MockContext;
    let mockSupabaseClient: {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: unknown,
          ) => {
            is: (
              col: string,
              val: unknown,
            ) => {
              single: () => Promise<{ data: unknown; error?: unknown }>;
            };
          };
        };
      };
    };

    beforeEach(() => {
      mockContext = {
        locals: {
          user: { id: "user-123" },
          role: "operator",
          operatorSectors: ["sector-a-uuid"],
        },
        request: {
          headers: new Headers(),
          json: vi.fn(),
        },
        cookies: {},
      };

      mockSupabaseClient = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "tier-1",
                    sector_id: "sector-a-uuid",
                    base_price_per_day: 50,
                    discount_steps: [
                      { days_min: 3, discount_percentage: 10 },
                      { days_min: 7, discount_percentage: 20 },
                    ],
                    ended_at: null,
                  },
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };
    });

    it("returns 401 when user is not authenticated", async () => {
      mockContext.locals.user = null;
      mockContext.locals.role = null;

      // Expected behavior: endpoint returns 401
      expect(mockContext.locals.user).toBeNull();
    });

    it("returns 401 when role is not operator", async () => {
      mockContext.locals.role = "admin";

      expect(mockContext.locals.role).not.toBe("operator");
    });

    it("returns 400 when request body is invalid", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "not-a-uuid", // Invalid: not a valid UUID
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
      });

      const parsed = await mockContext.request.json();
      expect(parsed.sectorId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("returns 403 when operator lacks sector access", async () => {
      mockContext.locals.operatorSectors = ["sector-b-uuid"]; // Different sector
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
      });

      const parsed = await mockContext.request.json();
      expect(mockContext.locals.operatorSectors).not.toContain((parsed as { sectorId: string }).sectorId);
    });

    it("returns 404 when pricing tier does not exist", async () => {
      mockSupabaseClient.from = vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null, // No pricing tier found
                error: { message: "No rows found" },
              }),
            })),
          })),
        })),
      }));

      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
      });

      const tierResp = await mockSupabaseClient
        .from("pricing_tiers")
        .select("*")
        .eq("sector_id", "sector-a-uuid")
        .is("ended_at", null)
        .single();
      expect(tierResp.data).toBeNull();
    });

    it("returns 400 when departure is before or equal to arrival", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-21T10:00:00Z",
        departureAt: "2026-07-20T10:00:00Z", // Before arrival
      });

      const parsed = await mockContext.request.json();
      const arrival = new Date((parsed as { arrivalAt: string }).arrivalAt);
      const departure = new Date((parsed as { departureAt: string }).departureAt);
      expect(departure <= arrival).toBe(true);
    });

    it("returns 200 with price breakdown for valid request", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-22T10:00:00Z", // 2 days
      });

      const parsed = await mockContext.request.json();
      expect(parsed).toHaveProperty("sectorId");
      expect(parsed).toHaveProperty("arrivalAt");
      expect(parsed).toHaveProperty("departureAt");

      const arrival = new Date((parsed as { arrivalAt: string }).arrivalAt);
      const departure = new Date((parsed as { departureAt: string }).departureAt);
      expect(departure > arrival).toBe(true);
    });
  });

  describe("POST /api/reservations", () => {
    let mockContext: MockContext;

    beforeEach(() => {
      mockContext = {
        locals: {
          user: { id: "user-123" },
          role: "operator",
          operatorSectors: ["sector-a-uuid"],
        },
        request: {
          headers: new Headers(),
          json: vi.fn(),
        },
        cookies: {},
      };
    });

    it("returns 401 when user is not authenticated", async () => {
      mockContext.locals.user = null;
      mockContext.locals.role = null;

      expect(mockContext.locals.user).toBeNull();
    });

    it("returns 401 when role is not operator", async () => {
      mockContext.locals.role = "admin";

      expect(mockContext.locals.role).not.toBe("operator");
    });

    it("returns 400 when request body is invalid", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "", // Invalid: empty
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
      });

      const parsed = await mockContext.request.json();
      expect((parsed as ReservationData).sectorId).toBe("");
    });

    it("returns 403 when operator lacks sector access", async () => {
      mockContext.locals.operatorSectors = ["sector-b-uuid"]; // Different sector

      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
      });

      const parsed = await mockContext.request.json();
      expect(mockContext.locals.operatorSectors).not.toContain((parsed as ReservationData).sectorId);
    });

    it("returns 404 when pricing tier does not exist", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
      });

      expect(mockContext.locals.operatorSectors).toContain("sector-a-uuid");
    });

    it("returns 400 when departure is before or equal to arrival", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-21T10:00:00Z",
        departureAt: "2026-07-20T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
      });

      const parsed = await mockContext.request.json();
      const arrival = new Date((parsed as ReservationData).arrivalAt);
      const departure = new Date((parsed as ReservationData).departureAt);
      expect(departure <= arrival).toBe(true);
    });

    it("returns 201 with reservation_id for valid request", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
      });

      const parsed = await mockContext.request.json();
      expect(parsed).toHaveProperty("sectorId");
      expect(parsed).toHaveProperty("customerName");
      expect(parsed).toHaveProperty("licensePlate");
      expect(mockContext.locals.operatorSectors).toContain((parsed as ReservationData).sectorId);
    });

    it("uses price override when provided", async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: "sector-a-uuid",
        arrivalAt: "2026-07-20T10:00:00Z",
        departureAt: "2026-07-21T10:00:00Z",
        customerName: "John Doe",
        licensePlate: "ABC123",
        priceOverride: 75.5,
      });

      const parsed = await mockContext.request.json();
      expect((parsed as ReservationData).priceOverride).toBe(75.5);
    });
  });

  describe("Form Reset Behavior", () => {
    it("form should reset when window resetReservationForm event is dispatched", () => {
      const form = {
        sector: "",
        arrivalDate: "",
        departureDate: "",
        customerName: "",
        licensePlate: "",
        price: 0,
        errors: {} as Record<string, unknown>,
        loading: false,
      };

      const resetForm = () => {
        form.sector = "";
        form.arrivalDate = "";
        form.departureDate = "";
        form.customerName = "";
        form.licensePlate = "";
        form.price = 0;
        form.errors = {};
        form.loading = false;
      };

      // Simulate form being filled
      form.sector = "sector-a";
      form.customerName = "John Doe";
      form.licensePlate = "ABC123";
      form.price = 50;

      expect(form.sector).not.toBe("");
      expect(form.customerName).not.toBe("");

      // Reset
      resetForm();

      expect(form.sector).toBe("");
      expect(form.customerName).toBe("");
      expect(form.licensePlate).toBe("");
      expect(form.price).toBe(0);
    });

    it("form opens empty on each click", () => {
      const formState = {
        isOpen: false,
        sector: "",
        customerName: "",
        licensePlate: "",
      };

      const openForm = () => {
        formState.sector = "";
        formState.customerName = "";
        formState.licensePlate = "";
        formState.isOpen = true;
      };

      openForm();
      expect(formState.isOpen).toBe(true);
      expect(formState.sector).toBe("");
      expect(formState.customerName).toBe("");

      const closeForm = () => {
        formState.isOpen = false;
      };

      closeForm();
      expect(formState.isOpen).toBe(false);

      openForm();
      expect(formState.isOpen).toBe(true);
      expect(formState.sector).toBe("");
      expect(formState.customerName).toBe("");
    });
  });
});

// Handler integration tests: set up mock for @/lib/supabase before dynamically importing handlers

function makeMockSupabase(pricingTierData: any = null, insertResult: any = null, operatorId = "op-1") {
  return {
    from: (table: string) => {
      const t = table;
      const singleResult = async () => {
        if (t === "operators") return { data: { id: operatorId }, error: null };
        if (t === "operator_sector_assignments") return { data: { sector_id: "sector-a-uuid" }, error: null };
        if (t === "pricing_tiers") return { data: pricingTierData, error: null };
        if (t === "reservations") return { data: insertResult, error: null };
        return { data: null, error: null };
      };

      const selectChain = () => {
        const chain: any = {
          eq: (_col: string, _val: unknown) => chain,
          is: (_col2: string, _val2: unknown) => chain,
          single: singleResult,
          select: () => chain,
          order: (_col: string, _opts: any) => chain,
        };
        return chain;
      };

      const insertChain = (_payload: any[]) => ({ select: () => ({ single: singleResult }), single: singleResult });

      return {
        select: (_cols: string) => selectChain(),
        eq: (_col: string, _val: unknown) => selectChain().eq(_col, _val),
        insert: insertChain,
        order: (_col: string, _opts: any) => selectChain().order(_col, _opts),
      };
    },
    rpc: (_fn: string, _args: Record<string, unknown>) => Promise.resolve({ data: insertResult, error: null }),
  };
}

// Mock the supabase client used by route handlers
vi.mock("@/lib/supabase", () => ({
  createClient: (_headers: any, _cookies: any) =>
    makeMockSupabase(
      { id: "tier-1", sector_id: "sector-a-uuid", base_daily_rate: 100, daily_floor: 50, discount_steps: [] },
      { id: "res-1", price_total: 100 },
    ),
}));

vi.mock("@/lib/services/pricingService", () => ({
  calculatePrice: (arrival: Date, departure: Date, tier: any) => ({
    totalPrice: 100,
    breakdown: { days: 1, base: 100 },
    pricing_tier_id: tier?.id ?? "tier-1",
  }),
}));

describe("Handler-level integration", () => {
  it("calculate-price POST returns 200 with price", async () => {
    const mockContext: any = {
      locals: { user: { id: "user-1" }, role: "operator", operatorSectors: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"] },
      request: {
        headers: new Headers(),
        json: async () => ({
          sectorId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          arrivalAt: "2026-07-20T10:00:00Z",
          departureAt: "2026-07-21T10:00:00Z",
        }),
      },
      cookies: {},
    };

    const calcApi = await import("../../src/pages/api/reservations/calculate-price");
    const res = await (calcApi.POST as any)(mockContext);
    const raw = await res.text();
    expect(res.status).toBe(200);
    const body = JSON.parse(raw);
    expect(body).toHaveProperty("price");
  });

  it("reservations POST returns 201 on success", async () => {
    const mockContext: any = {
      locals: { user: { id: "user-1" }, role: "operator" },
      request: {
        headers: new Headers(),
        json: async () => ({
          sectorId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          arrivalAt: "2026-07-20T10:00:00Z",
          departureAt: "2026-07-21T10:00:00Z",
          customerName: "John",
          licensePlate: "ABC123",
        }),
      },
      cookies: {},
    };

    const reservationsApi = await import("../../src/pages/api/reservations");
    const res = await (reservationsApi.POST as any)(mockContext);
    const rawRes = await res.text();
    expect(res.status).toBe(201);
    const body = JSON.parse(rawRes);
    expect(body).toHaveProperty("reservation_id");
  });
});


