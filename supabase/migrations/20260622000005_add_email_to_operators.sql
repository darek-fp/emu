-- Add email field to operators table and make user_id optional
-- This allows operators to be created without auth users; they sign up separately

ALTER TABLE public.operators
  ADD COLUMN email TEXT UNIQUE NOT NULL DEFAULT '',
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old unique constraint on user_id since it's now optional
ALTER TABLE public.operators
  DROP CONSTRAINT operators_user_id_key;

-- Update comment on user_id to reflect that it's optional
COMMENT ON COLUMN public.operators.user_id IS 'Optional reference to auth.users. Populated when operator signs up separately.';
COMMENT ON COLUMN public.operators.email IS 'Email address of the operator. Used for sending invitations and as login credential.';
