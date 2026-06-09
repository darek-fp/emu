-- Sectors table: parking lot organizational unit

CREATE TABLE public.sectors (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
  spot_count INTEGER     NOT NULL CHECK (spot_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

-- RLS policy: authenticated users can read sectors
CREATE POLICY sectors_select ON public.sectors FOR SELECT
  USING (public.current_user_role() IN ('admin', 'operator'));

-- RLS policy: only admins can insert sectors
CREATE POLICY sectors_insert ON public.sectors FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can update sectors
CREATE POLICY sectors_update ON public.sectors FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can delete sectors
CREATE POLICY sectors_delete ON public.sectors FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Attach updated_at trigger
CREATE TRIGGER sectors_set_updated_at
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
