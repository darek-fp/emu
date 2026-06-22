-- Phase 1: Create operators table for operator management
-- Operators are linked to auth.users and have soft-delete via deactivated_at

CREATE TABLE public.operators (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  deactivated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;

-- RLS policy: operators can read only their own record
CREATE POLICY operators_select_self ON public.operators FOR SELECT
  USING (auth.uid() = user_id);

-- RLS policy: admins can read all operators
CREATE POLICY operators_select_admin ON public.operators FOR SELECT
  USING (public.current_user_role() = 'admin');

-- RLS policy: only admins can insert operators
CREATE POLICY operators_insert ON public.operators FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can update operators
CREATE POLICY operators_update ON public.operators FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can delete operators (soft-delete via deactivated_at)
CREATE POLICY operators_delete ON public.operators FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Attach updated_at trigger
CREATE TRIGGER operators_set_updated_at
  BEFORE UPDATE ON public.operators
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
