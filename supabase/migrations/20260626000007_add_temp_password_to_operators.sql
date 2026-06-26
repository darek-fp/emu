-- Add temp_password and temp_password_expires columns to operators table
-- Allow admin-created operators to use temp passwords for signup

ALTER TABLE public.operators
  ADD COLUMN temp_password_hash TEXT,
  ADD COLUMN temp_password_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.operators.temp_password_hash IS 'Hashed temporary password for operator signup. Must be set when operator is created by admin.';
COMMENT ON COLUMN public.operators.temp_password_expires_at IS 'When the temporary password expires. Prevents reuse after a long period.';
