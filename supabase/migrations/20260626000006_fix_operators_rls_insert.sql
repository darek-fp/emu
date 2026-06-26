-- Create admin-only function to insert operators (bypasses RLS via SECURITY DEFINER)
-- This function checks the JWT for admin role, then inserts as the database owner

CREATE OR REPLACE FUNCTION public.create_operator_by_admin(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_operator_id UUID;
  v_admin_role TEXT;
BEGIN
  -- Verify user has admin role in JWT
  v_admin_role := (auth.jwt() -> 'app_metadata' ->> 'role')::TEXT;
  
  IF v_admin_role IS NULL OR v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only users with admin role can create operators';
  END IF;

  -- Insert operator (SECURITY DEFINER bypasses RLS)
  INSERT INTO public.operators (email, deactivated_at)
    VALUES (p_email, NULL)
    RETURNING id INTO v_operator_id;

  RETURN v_operator_id;
END;
$$;

-- Grant execution to authenticated users (the function checks admin role)
GRANT EXECUTE ON FUNCTION public.create_operator_by_admin(TEXT) TO authenticated;

-- Also create a function for sector assignments to maintain consistency
CREATE OR REPLACE FUNCTION public.assign_operator_sectors(
  p_operator_id UUID,
  p_sector_ids UUID[]
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_role TEXT;
  v_sector_id UUID;
BEGIN
  -- Verify user has admin role in JWT
  v_admin_role := (auth.jwt() -> 'app_metadata' ->> 'role')::TEXT;
  
  IF v_admin_role IS NULL OR v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only users with admin role can assign sectors';
  END IF;

  -- Insert sector assignments (SECURITY DEFINER bypasses RLS)
  FOREACH v_sector_id IN ARRAY p_sector_ids LOOP
    INSERT INTO public.operator_sector_assignments (operator_id, sector_id)
      VALUES (p_operator_id, v_sector_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_operator_sectors(UUID, UUID[]) TO authenticated;

-- Revert the policy change - keep the original strict policy since we now use functions
DROP POLICY IF EXISTS operators_insert ON public.operators;

CREATE POLICY operators_insert ON public.operators FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

