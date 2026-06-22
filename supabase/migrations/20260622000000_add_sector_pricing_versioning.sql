-- Phase 1: Add sector_id and versioning to pricing_tiers table
-- This migration converts pricing_tiers from a global, single-active model to per-sector with versioning

-- Step 1: Add sector_id column (nullable initially for backfill)
ALTER TABLE public.pricing_tiers
ADD COLUMN sector_id UUID;

-- Step 2: Add ended_at column for versioning
ALTER TABLE public.pricing_tiers
ADD COLUMN ended_at TIMESTAMPTZ;

-- Step 3: For MVP, assume there's only one sector. Backfill sector_id with the first sector.
-- In a real scenario, you'd migrate data sector-by-sector. For now, get the first (or only) sector.
UPDATE public.pricing_tiers
SET sector_id = (SELECT id FROM public.sectors LIMIT 1)
WHERE sector_id IS NULL;

-- Step 4: Make sector_id NOT NULL after backfill
ALTER TABLE public.pricing_tiers
ALTER COLUMN sector_id SET NOT NULL;

-- Step 5: Add FK constraint
ALTER TABLE public.pricing_tiers
ADD CONSTRAINT pricing_tiers_sector_fk
FOREIGN KEY (sector_id) REFERENCES public.sectors(id);

-- Step 6: Drop the old global unique index on is_active
DROP INDEX IF EXISTS one_active_tier;

-- Step 7: Create new per-sector unique index (one active tier per sector)
CREATE UNIQUE INDEX one_active_tier_per_sector
ON public.pricing_tiers(sector_id)
WHERE ended_at IS NULL;

-- Step 8: Convert is_active boolean to represent ended_at semantics
-- If is_active = true, set ended_at to NULL (active)
-- If is_active = false, set ended_at to now() (inactive/archived)
UPDATE public.pricing_tiers
SET ended_at = CASE WHEN is_active = false THEN now() ELSE NULL END;

-- Step 9: Drop is_active column (no longer needed; ended_at = NULL means active)
ALTER TABLE public.pricing_tiers
DROP COLUMN is_active;

-- Step 10: Update RLS policy for pricing_tiers to respect sector_id
-- (Admin reads/writes all sectors, operators see their assigned sectors - enforced in middleware)
-- Keep existing RLS structure for now; middleware will filter by operator sector assignments
