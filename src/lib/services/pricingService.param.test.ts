import { describe, it, expect } from "vitest";
import { calculatePrice } from "./pricingService";

// Independent fixture-based expected totals (hand-verified samples)
const testVectors = [
  {
    name: "1-day no discount",
    arrival: new Date("2026-01-15T10:00:00Z"),
    departure: new Date("2026-01-15T17:00:00Z"),
    tier: {
      id: "t1",
      sector_id: "s1",
      base_daily_rate: 100,
      daily_floor: 50,
      discount_steps: [],
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    expected: 100.0,
  },
  {
    name: "3-day with tiered discounts and floor (sample)",
    arrival: new Date("2026-01-15T12:00:00Z"),
    departure: new Date("2026-01-18T12:00:00Z"), // 4 calendar days
    tier: {
      id: "t2",
      sector_id: "s1",
      base_daily_rate: 100,
      daily_floor: 60,
      discount_steps: [
        { dayMin: 1, dayMax: 3, discountPercent: 0 },
        { dayMin: 4, dayMax: 7, discountPercent: 50 },
      ],
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    // Expected calculation (hand computed):
    // Days 1-3 -> 3 days at $100 = 300
    // Day 4 -> 50% discount => $50 but floor=60 => use $60
    // Total = 360
    expected: 360.0,
  },
  {
    name: "fractional rate rounding",
    arrival: new Date("2026-01-15T10:00:00Z"),
    departure: new Date("2026-01-16T10:00:00Z"), // 2 days
    tier: {
      id: "t3",
      sector_id: "s1",
      base_daily_rate: 99.99,
      daily_floor: 49.99,
      discount_steps: [],
      ended_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    expected: 199.98,
  },
];

describe("pricingService parametric vectors (independent expected fixtures)", () => {
  for (const v of testVectors) {
    it(v.name, () => {
      const result = calculatePrice(v.arrival, v.departure, v.tier as any);
      // Use toBeCloseTo for floating rounding safety
      expect(result.totalPrice).toBeCloseTo(v.expected, 2);
    });
  }
});
