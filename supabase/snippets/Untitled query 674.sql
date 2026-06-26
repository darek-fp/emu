 CREATE OR REPLACE FUNCTION public.get_operator_by_email(p_email TEXT)
 RETURNS TABLE(id UUID, user_id UUID, temp_password_hash TEXT, temp_password_expires_at TIMESTAMPTZ) 
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
 BEGIN
   RETURN QUERY
   SELECT 
     operators.id,
     operators.user_id,
     operators.temp_password_hash,
     operators.temp_password_expires_at
   FROM public.operators
   WHERE operators.email = p_email;
 END;
 $$;
 
 GRANT EXECUTE ON FUNCTION public.get_operator_by_email(TEXT) TO authenticated, anon;
