-- Domain helper functions: set_updated_at trigger and current_user_role JWT reader

-- Trigger function: automatically update the updated_at column on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- RLS helper: read role from JWT app_metadata
-- SECURITY DEFINER required to access auth.jwt() in RLS policy context
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role')::TEXT;
$$;
