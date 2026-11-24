-- Hosted project only (pg_net is not in the local test database). Applied 2026-11-24.
create extension if not exists pg_net with schema extensions;
-- private.internal_config rows: push_url = https://<ref>.supabase.co/functions/v1/push, push_secret = random hex.
-- Edge Function "push" is deployed with verify_jwt = false and checks the secret via public.check_push_secret().
