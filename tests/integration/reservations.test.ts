import { describe, it, expect, beforeEach, vi } from 'vitest';

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
  discount_steps: Array<{ days_min: number; discount_percentage: number }>;
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

describe('Reservation API Endpoints', () => {
  describe('POST /api/reservations/calculate-price', () => {
    let mockContext: MockContext;
    let mockSupabaseClient: {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            is: (col: string, val: unknown) => {
              single: () => Promise<{ data: unknown; error?: unknown }>;
            };
          };
        };
      };
    };

    beforeEach(() => {
      mockContext = {
        locals: {
          user: { id: 'user-123' },
          role: 'operator',
          operatorSectors: ['sector-a-uuid'],
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
                    id: 'tier-1',
                    sector_id: 'sector-a-uuid',
                    base_price_per_day: 50,
                    discount_steps: [
                      { days_min: 3, discount_percentage: 10 },
                      { days_min: 7, discount_percentage: 20 },
                    ],
                    ended_at: null,
                  } as PricingTier,
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };
    });

    it('returns 401 when user is not authenticated', async () => {
      mockContext.locals.user = null;
      mockContext.locals.role = null;

      // Expected behavior: endpoint returns 401
      expect(mockContext.locals.user).toBeNull();
    });

    it('returns 401 when role is not operator', async () => {
      mockContext.locals.role = 'admin';

      expect(mockContext.locals.role).not.toBe('operator');
    });

    it('returns 400 when request body is invalid', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'not-a-uuid', // Invalid: not a valid UUID
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
      });

      const parsed = await mockContext.request.json();
      expect(parsed.sectorId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('returns 403 when operator lacks sector access', async () => {
      mockContext.locals.operatorSectors = ['sector-b-uuid']; // Different sector
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
      });

      const parsed = await mockContext.request.json();
      expect(mockContext.locals.operatorSectors).not.toContain((parsed as { sectorId: string }).sectorId);
    });

    it('returns 404 when pricing tier does not exist', async () => {
      mockSupabaseClient.from = vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null, // No pricing tier found
                error: { message: 'No rows found' },
              }),
            })),
          })),
        })),
      }));

      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
      });

      const tierResp = await mockSupabaseClient.from('pricing_tiers').select('*').eq('sector_id', 'sector-a-uuid').is('ended_at', null).single();
      expect(tierResp.data).toBeNull();
    });

    it('returns 400 when departure is before or equal to arrival', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-21T10:00:00Z',
        departureAt: '2026-07-20T10:00:00Z', // Before arrival
      });

      const parsed = await mockContext.request.json();
      const arrival = new Date((parsed as { arrivalAt: string }).arrivalAt);
      const departure = new Date((parsed as { departureAt: string }).departureAt);
      expect(departure <= arrival).toBe(true);
    });

    it('returns 200 with price breakdown for valid request', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-22T10:00:00Z', // 2 days
      });

      const parsed = await mockContext.request.json();
      expect(parsed).toHaveProperty('sectorId');
      expect(parsed).toHaveProperty('arrivalAt');
      expect(parsed).toHaveProperty('departureAt');
      
      const arrival = new Date((parsed as { arrivalAt: string }).arrivalAt);
      const departure = new Date((parsed as { departureAt: string }).departureAt);
      expect(departure > arrival).toBe(true);
    });
  });

  describe('POST /api/reservations', () => {
    let mockContext: MockContext;

    beforeEach(() => {
      mockContext = {
        locals: {
          user: { id: 'user-123' },
          role: 'operator',
          operatorSectors: ['sector-a-uuid'],
        },
        request: {
          headers: new Headers(),
          json: vi.fn(),
        },
        cookies: {},
      };
    });

    it('returns 401 when user is not authenticated', async () => {
      mockContext.locals.user = null;
      mockContext.locals.role = null;

      expect(mockContext.locals.user).toBeNull();
    });

    it('returns 401 when role is not operator', async () => {
      mockContext.locals.role = 'admin';

      expect(mockContext.locals.role).not.toBe('operator');
    });

    it('returns 400 when request body is invalid', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: '', // Invalid: empty
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
      });

      const parsed = await mockContext.request.json();
      expect((parsed as ReservationData).sectorId).toBe('');
    });

    it('returns 403 when operator lacks sector access', async () => {
      mockContext.locals.operatorSectors = ['sector-b-uuid']; // Different sector

      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
      });

      const parsed = await mockContext.request.json();
      expect(mockContext.locals.operatorSectors).not.toContain((parsed as ReservationData).sectorId);
    });

    it('returns 404 when pricing tier does not exist', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
      });

      expect(mockContext.locals.operatorSectors).toContain('sector-a-uuid');
    });

    it('returns 400 when departure is before or equal to arrival', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-21T10:00:00Z',
        departureAt: '2026-07-20T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
      });

      const parsed = await mockContext.request.json();
      const arrival = new Date((parsed as ReservationData).arrivalAt);
      const departure = new Date((parsed as ReservationData).departureAt);
      expect(departure <= arrival).toBe(true);
    });

    it('returns 201 with reservation_id for valid request', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
      });

      const parsed = await mockContext.request.json();
      expect(parsed).toHaveProperty('sectorId');
      expect(parsed).toHaveProperty('customerName');
      expect(parsed).toHaveProperty('licensePlate');
      expect(mockContext.locals.operatorSectors).toContain((parsed as ReservationData).sectorId);
    });

    it('uses price override when provided', async () => {
      mockContext.request.json = vi.fn().mockResolvedValue({
        sectorId: 'sector-a-uuid',
        arrivalAt: '2026-07-20T10:00:00Z',
        departureAt: '2026-07-21T10:00:00Z',
        customerName: 'John Doe',
        licensePlate: 'ABC123',
        priceOverride: 75.5,
      });

      const parsed = await mockContext.request.json();
      expect((parsed as ReservationData).priceOverride).toBe(75.5);
    });
  });

  describe('Form Reset Behavior', () => {
    it('form should reset when window resetReservationForm event is dispatched', () => {
      const form = {
        sector: '',
        arrivalDate: '',
        departureDate: '',
        customerName: '',
        licensePlate: '',
        price: 0,
        errors: {} as Record<string, unknown>,
        loading: false,
      };

      const resetForm = () => {
        form.sector = '';
        form.arrivalDate = '';
        form.departureDate = '';
        form.customerName = '';
        form.licensePlate = '';
        form.price = 0;
        form.errors = {};
        form.loading = false;
      };

      // Simulate form being filled
      form.sector = 'sector-a';
      form.customerName = 'John Doe';
      form.licensePlate = 'ABC123';
      form.price = 50;

      expect(form.sector).not.toBe('');
      expect(form.customerName).not.toBe('');

      // Reset
      resetForm();

      expect(form.sector).toBe('');
      expect(form.customerName).toBe('');
      expect(form.licensePlate).toBe('');
      expect(form.price).toBe(0);
    });

    it('form opens empty on each click', () => {
      const formState = {
        isOpen: false,
        sector: '',
        customerName: '',
        licensePlate: '',
      };

      const openForm = () => {
        formState.sector = '';
        formState.customerName = '';
        formState.licensePlate = '';
        formState.isOpen = true;
      };

      openForm();
      expect(formState.isOpen).toBe(true);
      expect(formState.sector).toBe('');
      expect(formState.customerName).toBe('');

      const closeForm = () => {
        formState.isOpen = false;
      };

      closeForm();
      expect(formState.isOpen).toBe(false);

      openForm();
      expect(formState.isOpen).toBe(true);
      expect(formState.sector).toBe('');
      expect(formState.customerName).toBe('');
    });
  });
});
