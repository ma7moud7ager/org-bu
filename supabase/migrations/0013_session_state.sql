-- 0013: one round-trip for the web route guard.
create or replace function public.session_state()
returns table (has_employee boolean, is_platform_admin boolean)
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from public.employees where user_id = auth.uid() and status = 'active'),
         exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke execute on function public.session_state() from public, anon;
grant execute on function public.session_state() to authenticated;
