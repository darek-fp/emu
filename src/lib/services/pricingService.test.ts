import { describe, it, expect } from "vitest";
import { calculatePrice, calculateFractionalDays, type PricingTier } from "./pricingService";

// Helper to create a test pricing tier
function createTestTier(
  baseRate: number,
  floor: number,
  discountSteps?: { dayMin: number; dayMax: number; discountPercent: number }[],
): PricingTier {
  return {
    id: "test-tier-1",
    sector_id: "test-sector-1",
    base_daily_rate: baseRate,
    daily_floor: floor,
    discount_steps: discountSteps || [],
    ended_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("calculateFractionalDays", () => {
  it("counts a single day (same calendar day)", () => {
    const arrival = new Date("2026-01-15T10:00:00Z");
    const departure = new Date("2026-01-15T17:00:00Z");
    expect(calculateFractionalDays(arrival, departure)).toBe(1);
  });

  it("counts overnight stay as 2 days", () => {
    const arrival = new Date("2026-01-15T14:00:00Z");
    const departure = new Date("2026-01-16T14:00:00Z");
    expect(calculateFractionalDays(arrival, departure)).toBe(2);
  });

  it("counts partial day at end as full day", () => {
    const arrival = new Date("2026-01-15T14:00:00Z");
    const departure = new Date("2026-01-17T10:00:00Z");
    // Mon 2pm to Wed 10am = 3 days (Mon + Tue + Wed partial)
    expect(calculateFractionalDays(arrival, departure)).toBe(3);
  });

  it("handles 4-day stay", () => {
    const arrival = new Date("2026-01-15T12:00:00Z");
    const departure = new Date("2026-01-18T12:00:00Z");
    // 3 full days + 1 partial = 4 days
    expect(calculateFractionalDays(arrival, departure)).toBe(4);
  });

  it("throws error if arrival >= departure", () => {
    const arrival = new Date("2026-01-15T14:00:00Z");
    const departure = new Date("2026-01-15T14:00:00Z");
    expect(() => calculateFractionalDays(arrival, departure)).toThrow();
  });
});

describe("calculatePrice", () => {
  describe("basic pricing (no discounts)", () => {
    it("calculates simple 1-day stay at base rate", () => {
      const tier = createTestTier(100, 50);
      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-15T17:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      expect(result.totalPrice).toBe(100);
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].subtotal).toBe(100);
    });

    it("calculates 2-day stay at base rate", () => {
      const tier = createTestTier(100, 50);
      const arrival = new Date("2026-01-15T14:00:00Z");
      const departure = new Date("2026-01-17T14:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      expect(result.totalPrice).toBe(300); // 3 calendar days (Jan 15, 16, 17) * $100
    });

    it("applies floor when base rate is below floor", () => {
      const tier = createTestTier(40, 50); // base rate < floor
      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-15T17:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      expect(result.totalPrice).toBe(50); // Uses floor
    });
  });

  describe("discount tiering", () => {
    it("applies correct discount for days in tier", () => {
      const tier = createTestTier(100, 50, [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 7, discountPercent: 10 },
        { dayMin: 8, dayMax: 365, discountPercent: 20 },
      ]);

      const arrival = new Date("2026-01-15T12:00:00Z");
      const departure = new Date("2026-01-22T12:00:00Z"); // 8 days

      const result = calculatePrice(arrival, departure, tier);

      // Days 1-3: 100 * 1.0 = 100/day → 300
      // Days 4-7: 100 * 0.9 = 90/day → 360
      // Day 8: 100 * 0.8 = 80/day → 80
      // Total: 740
      expect(result.totalPrice).toBe(740);
      expect(result.breakdown).toHaveLength(3);
      expect(result.breakdown[0].subtotal).toBe(300);
      expect(result.breakdown[1].subtotal).toBe(360);
      expect(result.breakdown[2].subtotal).toBe(80);
    });

    it("applies floor per tier", () => {
      const tier = createTestTier(100, 60, [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 7, discountPercent: 50 }, // 50% discount = $50/day, but floor is $60
      ]);

      const arrival = new Date("2026-01-15T12:00:00Z");
      const departure = new Date("2026-01-19T12:00:00Z"); // 5 days (days 1-3 @ $100, days 4-5 @ floor $60)

      const result = calculatePrice(arrival, departure, tier);

      // Days 1-3: 100/day → 300
      // Days 4-5: 50/day but floor $60 → 120
      // Total: 420
      expect(result.totalPrice).toBe(420);
    });

    it("handles boundary between discount tiers (3 days vs 4 days)", () => {
      const tier = createTestTier(100, 50, [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 365, discountPercent: 10 },
      ]);

      // 3-day stay should be all at tier 1
      const arrival3 = new Date("2026-01-15T12:00:00Z");
      const departure3 = new Date("2026-01-18T12:00:00Z"); // 4 calendar days (Jan 15, 16, 17, 18)
      const result3 = calculatePrice(arrival3, departure3, tier);
      expect(result3.totalPrice).toBe(390); // Days 1-3: $300, Day 4: $90

      // 4-day stay should span both tiers
      const arrival4 = new Date("2026-01-15T12:00:00Z");
      const departure4 = new Date("2026-01-19T12:00:00Z"); // 5 calendar days (Jan 15-19)
      const result4 = calculatePrice(arrival4, departure4, tier);
      // Days 1-3: 100 → 300
      // Days 4-5: 90 → 180
      // Total: 480
      expect(result4.totalPrice).toBe(480);
    });

    it("handles fractional days at tier boundary", () => {
      const tier = createTestTier(100, 50, [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 7, discountPercent: 20 },
      ]);

      // Jan 15 2pm to Jan 19 10am = 5 calendar days, spans both tiers
      const arrival = new Date("2026-01-15T14:00:00Z");
      const departure = new Date("2026-01-19T10:00:00Z");
      const result = calculatePrice(arrival, departure, tier);

      // Days 1-3: 100/day → 300
      // Days 4-5: 80/day → 160
      // Total: 460
      expect(result.totalPrice).toBe(460);
    });
  });

  describe("edge cases", () => {
    it("handles empty discount_steps array (falls back to base rate)", () => {
      const tier = createTestTier(100, 50, []);
      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-17T10:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      // No tiers defined, so use base rate for all days (3 calendar days)
      expect(result.totalPrice).toBe(300); // 3 days * $100
    });

    it("handles null discount_steps (falls back to base rate)", () => {
      const tier = createTestTier(100, 50);
      tier.discount_steps = null;

      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-17T10:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      expect(result.totalPrice).toBe(300); // 3 days * $100
    });

    it("rounds to 2 decimal places", () => {
      const tier = createTestTier(100.333, 50, []);
      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-15T17:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      // Should round to 2 decimal places
      expect(result.totalPrice).toBe(100.33);
    });

    it("throws error on invalid inputs", () => {
      const tier = createTestTier(100, 50);

      // Non-Date arrival
      expect(() => {
        calculatePrice("2026-01-15" as unknown as Date, new Date(), tier);
      }).toThrow();

      // Departure before arrival
      expect(() => {
        const arrival = new Date("2026-01-15T17:00:00Z");
        const departure = new Date("2026-01-15T10:00:00Z");
        calculatePrice(arrival, departure, tier);
      }).toThrow();

      // Zero base rate
      expect(() => {
        const badTier = createTestTier(0, 50);
        calculatePrice(new Date("2026-01-15T10:00:00Z"), new Date("2026-01-15T17:00:00Z"), badTier);
      }).toThrow();

      // Negative floor
      expect(() => {
        const badTier = createTestTier(100, -10);
        calculatePrice(new Date("2026-01-15T10:00:00Z"), new Date("2026-01-15T17:00:00Z"), badTier);
      }).toThrow();
    });

    it("handles 10-day stay with multiple discount tiers", () => {
      const tier = createTestTier(100, 40, [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 7, discountPercent: 10 },
        { dayMin: 8, dayMax: 365, discountPercent: 25 },
      ]);

      const arrival = new Date("2026-01-15T12:00:00Z");
      const departure = new Date("2026-01-25T12:00:00Z"); // 11 calendar days (Jan 15-25)

      const result = calculatePrice(arrival, departure, tier);

      // Days 1-3: 100/day → 300
      // Days 4-7: 90/day → 360
      // Days 8-11: 75/day → 300
      // Total: 960
      expect(result.totalPrice).toBe(960);
      expect(result.breakdown).toHaveLength(3);
    });
  });

  describe("decimal precision", () => {
    it("handles fractional rates correctly", () => {
      const tier = createTestTier(99.99, 49.99, []);
      const arrival = new Date("2026-01-15T10:00:00Z");
      const departure = new Date("2026-01-16T10:00:00Z");

      const result = calculatePrice(arrival, departure, tier);

      // 2 days * $99.99
      expect(result.totalPrice).toBe(199.98);
    });
  });
});
