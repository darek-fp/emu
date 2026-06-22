-- Phase 5: Update reservations RLS to restrict operators to their assigned sectors

-- Create helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() ->> 'app_metadata' ->> 'role' = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to check if current user (operator) has access to a sector
CREATE OR REPLACE FUNCTION operator_has_sector_access(sector_id UUID)
RETURNS boolean AS $$
DECLARE
  operator_id UUID;
BEGIN
  -- If user is admin, allow
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Get the operator record for current user
  SELECT id INTO operator_id FROM public.operators WHERE user_id = auth.uid() AND deactivated_at IS NULL;
  
  -- If no active operator record, deny
  IF operator_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if operator has access to this sector
  RETURN EXISTS (
    SELECT 1 FROM public.operator_sector_assignments
    WHERE operator_id = operator_id AND sector_id = sector_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing RLS policies (we're replacing them with more restrictive versions)
DROP POLICY IF EXISTS reservations_select ON public.reservations;
DROP POLICY IF EXISTS reservations_insert ON public.reservations;
DROP POLICY IF EXISTS reservations_update ON public.reservations;

-- New RLS policy: authenticated users can read reservations for sectors they have access to
CREATE POLICY reservations_select ON public.reservations FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'operator') AND
    operator_has_sector_access(sector_id)
  );

-- New RLS policy: authenticated users can insert reservations for sectors they have access to
CREATE POLICY reservations_insert ON public.reservations FOR INSERT
  WITH CHECK (
    public.current_user_role() IN ('admin', 'operator') AND
    operator_has_sector_access(sector_id)
  );

-- New RLS policy: authenticated users can update reservations for sectors they have access to
CREATE POLICY reservations_update ON public.reservations FOR UPDATE
  USING (
    public.current_user_role() IN ('admin', 'operator') AND
    operator_has_sector_access(sector_id)
  )
  WITH CHECK (
    public.current_user_role() IN ('admin', 'operator') AND
    operator_has_sector_access(sector_id)
  );
