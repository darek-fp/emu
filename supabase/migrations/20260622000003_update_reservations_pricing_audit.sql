-- Phase 1: Add pricing_tier_id and created_by_operator_id to reservations for audit and immutability

-- Step 1: Add pricing_tier_id column (nullable initially for backfill)
ALTER TABLE public.reservations
ADD COLUMN pricing_tier_id UUID;

-- Step 2: Add created_by_operator_id column (nullable, admin can create without operator context)
ALTER TABLE public.reservations
ADD COLUMN created_by_operator_id UUID;

-- Step 3: Add FK constraints
ALTER TABLE public.reservations
ADD CONSTRAINT reservations_pricing_tier_fk
FOREIGN KEY (pricing_tier_id) REFERENCES public.pricing_tiers(id);

ALTER TABLE public.reservations
ADD CONSTRAINT reservations_created_by_operator_fk
FOREIGN KEY (created_by_operator_id) REFERENCES public.operators(id);

-- Step 4: Backfill pricing_tier_id for existing reservations
-- For each reservation, find the sector's active pricing tier (ended_at IS NULL)
-- and link the reservation to it. If no active tier exists, this will leave pricing_tier_id NULL
-- (admin/system can fix these later if needed).
UPDATE public.reservations r
SET pricing_tier_id = (
  SELECT id FROM public.pricing_tiers pt
  WHERE pt.sector_id = r.sector_id
    AND pt.ended_at IS NULL
  LIMIT 1
);

-- Step 5: Make pricing_tier_id NOT NULL after backfill
-- (This ensures all new reservations must reference a tier)
ALTER TABLE public.reservations
ALTER COLUMN pricing_tier_id SET NOT NULL;

-- Step 6: Add index for faster lookups by pricing_tier_id
CREATE INDEX idx_reservations_pricing_tier ON public.reservations(pricing_tier_id);

-- Step 7: Add index for faster lookups by created_by_operator_id
CREATE INDEX idx_reservations_created_by_operator ON public.reservations(created_by_operator_id);
