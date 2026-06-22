-- Phase 1: Create operator_sector_assignments join table for many-to-many operator-to-sector linkage

CREATE TABLE public.operator_sector_assignments (
  operator_id UUID        NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  sector_id   UUID        NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, sector_id)
);

-- Enable RLS
ALTER TABLE public.operator_sector_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policy: operators can read their own assignments
CREATE POLICY operator_sector_assignments_select_self ON public.operator_sector_assignments FOR SELECT
  USING (
    operator_id = (
      SELECT id FROM public.operators WHERE user_id = auth.uid()
    )
  );

-- RLS policy: admins can read all assignments
CREATE POLICY operator_sector_assignments_select_admin ON public.operator_sector_assignments FOR SELECT
  USING (public.current_user_role() = 'admin');

-- RLS policy: only admins can insert assignments
CREATE POLICY operator_sector_assignments_insert ON public.operator_sector_assignments FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can update assignments
CREATE POLICY operator_sector_assignments_update ON public.operator_sector_assignments FOR UPDATE
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- RLS policy: only admins can delete assignments
CREATE POLICY operator_sector_assignments_delete ON public.operator_sector_assignments FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Index for faster lookups: find sectors for a given operator
CREATE INDEX idx_operator_sector_assignments_operator ON public.operator_sector_assignments(operator_id);

-- Index for faster lookups: find operators for a given sector
CREATE INDEX idx_operator_sector_assignments_sector ON public.operator_sector_assignments(sector_id);
