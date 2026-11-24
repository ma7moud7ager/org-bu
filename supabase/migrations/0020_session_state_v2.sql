-- 0020: session_state() also reports whether the user's service has ended, and the ended company's name for /ended.
drop function if exists public.session_state();
create function public.session_state()
returns table (has_employee boolean, is_platform_admin boolean, is_terminated boolean)
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from public.employees where user_id = auth.uid() and status = 'active'),
         exists (select 1 from public.platform_admins where user_id = auth.uid()),
         exists (select 1 from public.employees where user_id = auth.uid() and status = 'terminated')
$$;
revoke execute on function public.session_state() from public, anon;
grant execute on function public.session_state() to authenticated;

create or replace function public.ended_company_name()
returns text
language sql stable security definer set search_path = public, extensions
as $$
  select c.legal_name from public.employees e join public.companies c on c.id = e.company_id
  where e.user_id = auth.uid() and e.status = 'terminated' limit 1
$$;
revoke execute on function public.ended_company_name() from public, anon;
grant execute on function public.ended_company_name() to authenticated;
