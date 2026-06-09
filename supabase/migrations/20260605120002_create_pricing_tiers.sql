-- Pricing tiers table: rate and discount schedule configuration

CREATE TABLE public.pricing_tiers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  base_daily_rate NUMERIC(10,2) NOT NULL CHECK (base_daily_rate > 0),
  daily_floor     NUMERIC(10,2) NOT NULL CHECK (daily_floor >= 0),
  discount_steps  JSONB       NOT NULL DEFAULT '[]',
  is_active       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: enforce at most one active pricing tier
CREATE UNIQUE INDEX one_active_tier ON public.pricing_tiers(is_active)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users can read pricing tiers
CREATE POLICY pricing_tiers_select ON public.pricing_tiers FOR SELECT
  USING (public.current_user_role() IN ('admin', 'operator'));

-- RLS policy: only admins can insert pricing tiers
CREATE POLICY pricing_tiers_insert ON public.pricing_tiers FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can update pricing tiers
CREATE POLICY pricing_tiers_update ON public.pricing_tiers FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can delete pricing tiers
CREATE POLICY pricing_tiers_delete ON public.pricing_tiers FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Attach updated_at trigger
CREATE TRIGGER pricing_tiers_set_updated_at
  BEFORE UPDATE ON public.pricing_tiers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
