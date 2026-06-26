-- Update the create_operator_by_admin function to accept and store temp password

DROP FUNCTION IF EXISTS public.create_operator_by_admin(TEXT);

CREATE OR REPLACE FUNCTION public.create_operator_by_admin(
  p_email TEXT,
  p_temp_password_hash TEXT,
  p_temp_password_expires_at TIMESTAMPTZ
)
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

  -- Insert operator with temp password (SECURITY DEFINER bypasses RLS)
  INSERT INTO public.operators (email, deactivated_at, temp_password_hash, temp_password_expires_at)
    VALUES (p_email, NULL, p_temp_password_hash, p_temp_password_expires_at)
    RETURNING id INTO v_operator_id;

  RETURN v_operator_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_operator_by_admin(TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
