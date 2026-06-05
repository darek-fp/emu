-- DEVELOPMENT ONLY
-- This seed provisions a local Admin account for testing role-protected routes.
-- Credentials are intentionally simple — change before any production use.
--
-- Apply with: npx supabase db reset  (runs automatically during reset)
-- Or manually: npx supabase db query --file supabase/seed.sql
-- Requires a running local Supabase instance: npx supabase start

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'admin@emu.dev',
  -- bcrypt hash of 'admin1234' (cost 10, generated via pgcrypto)
  '$2a$10$SVWqTe6VHNfrdByHtfiVk.l0nqFJRTI/Ju1UScykLIlBAcjqFEZ7i',
  now(),
  '{"provider": "email", "providers": ["email"], "role": "admin"}',
  '{}',
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Identity record required by GoTrue to authenticate email/password logins
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001',
  'email',
  '{"sub": "00000000-0000-0000-0000-000000000001", "email": "admin@emu.dev", "email_verified": true}',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
