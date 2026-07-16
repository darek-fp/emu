import type { Database } from "@/database.types";

// Type definitions
export type PricingTier = Database["public"]["Tables"]["pricing_tiers"]["Row"];

export interface DiscountStep {
  dayMin: number;
  dayMax: number;
  discountPercent: number;
}

export interface PriceBreakdown {
  tierIndex: number;
  dayMin: number;
  dayMax: number;
  daysInRange: number;
  discountPercent: number;
  baseRate: number;
  discountedRate: number;
  floorRate: number;
  appliedRate: number;
  subtotal: number;
}

export interface CalculationResult {
  totalPrice: number;
  breakdown: PriceBreakdown[];
}

/**
 * Calculate the total price for a parking reservation given arrival/departure times and a pricing tier.
 *
 * Key behaviors:
 * - Fractional days: any partial day in the stay window counts as a full day
 * - Discount tiers: applied based on total stay duration
 * - Floor: applied per-tier, not globally
 *
 * @param arrival Arrival timestamp
 * @param departure Departure timestamp
 * @param tier Pricing tier with base rate, floor, and discount steps
 * @returns Total price and detailed breakdown for each discount tier applied
 */
export function calculatePrice(arrival: Date, departure: Date, tier: PricingTier): CalculationResult {
  // Validate inputs
  if (!(arrival instanceof Date) || !(departure instanceof Date)) {
    throw new Error("Arrival and departure must be Date objects");
  }
  if (arrival >= departure) {
    throw new Error("Departure must be after arrival");
  }
  if (tier.base_daily_rate <= 0) {
    throw new Error("Base daily rate must be positive");
  }
  if (tier.daily_floor < 0) {
    throw new Error("Daily floor must be non-negative");
  }

  // Parse discount steps from JSONB
  let discountSteps: DiscountStep[] = [];
  if (tier.discount_steps) {
    try {
      let steps: unknown;
      if (Array.isArray(tier.discount_steps)) {
        steps = tier.discount_steps;
      } else if (typeof tier.discount_steps === "string") {
        steps = JSON.parse(tier.discount_steps);
      } else {
        steps = tier.discount_steps;
      }

      discountSteps = (Array.isArray(steps) ? steps : []).filter(
        (step: unknown) =>
          typeof step === "object" &&
          step !== null &&
          "dayMin" in step &&
          "dayMax" in step &&
          "discountPercent" in step,
      );
    } catch {
      // If parsing fails, treat as empty discount steps
      discountSteps = [];
    }
  }

  // Sort discount steps by day range
  discountSteps.sort((a, b) => a.dayMin - b.dayMin);

  // Calculate total stay duration in days (count each partial day as full day)
  const stayDurationDays = calculateFractionalDays(arrival, departure);

  // Build breakdown by applying each discount tier
  const breakdown: PriceBreakdown[] = [];
  let totalPrice = 0;
  let daysAssigned = 0;

  // Track which days fall into which discount tier
  for (let tierIndex = 0; tierIndex < discountSteps.length; tierIndex++) {
    const step = discountSteps[tierIndex];

    // Calculate how many days fall into this tier
    const tierStartDay = step.dayMin;
    const tierEndDay = step.dayMax;

    // Calculate overlap with our stay
    let daysInRange = 0;
    if (stayDurationDays >= tierStartDay) {
      // This tier applies to at least one day
      daysInRange = Math.min(tierEndDay - tierStartDay + 1, stayDurationDays - tierStartDay + 1);
      daysInRange = Math.max(0, daysInRange);

      if (daysInRange > 0) {
        // Apply discount
        const discountPercent = step.discountPercent;
        const baseRate = tier.base_daily_rate;
        const discountedRate = baseRate * ((100 - discountPercent) / 100);

        // Apply floor per tier
        const appliedRate = Math.max(discountedRate, tier.daily_floor);

        const subtotal = appliedRate * daysInRange;
        totalPrice += subtotal;

        breakdown.push({
          tierIndex,
          dayMin: tierStartDay,
          dayMax: tierEndDay,
          daysInRange,
          discountPercent,
          baseRate,
          discountedRate,
          floorRate: tier.daily_floor,
          appliedRate,
          subtotal,
        });

        daysAssigned += daysInRange;
      }
    }

    // If we've assigned all days, stop
    if (daysAssigned >= stayDurationDays) {
      break;
    }
  }

  // If some discount tiers applied but we haven't assigned all days, assign remaining days at base rate (respecting floor)
  if (daysAssigned < stayDurationDays) {
    const remainingDays = stayDurationDays - daysAssigned;
    const appliedRateForRemaining = Math.max(tier.base_daily_rate, tier.daily_floor);
    const subtotal = appliedRateForRemaining * remainingDays;
    totalPrice += subtotal;

    breakdown.push({
      tierIndex: -1,
      dayMin: daysAssigned + 1,
      dayMax: stayDurationDays,
      daysInRange: remainingDays,
      discountPercent: 0,
      baseRate: tier.base_daily_rate,
      discountedRate: tier.base_daily_rate,
      floorRate: tier.daily_floor,
      appliedRate: appliedRateForRemaining,
      subtotal,
    });
  }

  // Round to 2 decimal places (cents)
  const roundedPrice = Math.round(totalPrice * 100) / 100;

  return {
    totalPrice: roundedPrice,
    breakdown,
  };
}

/**
 * Calculate the number of days for a stay, counting any partial day as a full day.
 *
 * Examples:
 * - Mon 10am to Mon 5pm = 1 day
 * - Mon 10am to Tue 5pm = 2 days
 * - Mon 2pm to Wed 10am = 3 days
 *
 * @param arrival Arrival timestamp
 * @param departure Departure timestamp
 * @returns Number of days (always >= 1)
 */
export function calculateFractionalDays(arrival: Date, departure: Date): number {
  if (arrival >= departure) {
    throw new Error("Departure must be after arrival");
  }

  // Use UTC dates to avoid timezone issues
  const arrivalUTC = new Date(Date.UTC(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate()));
  const departureUTC = new Date(Date.UTC(departure.getUTCFullYear(), departure.getUTCMonth(), departure.getUTCDate()));

  // Count calendar days spanned (inclusive of both start and end dates)
  // e.g., Mon to Tue = 2 days, Mon to Mon = 1 day, Mon to Wed = 3 days
  const daysDiff = Math.floor((departureUTC.getTime() - arrivalUTC.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  return daysDiff;
}
