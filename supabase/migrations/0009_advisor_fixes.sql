-- 0009: tighten function exposure flagged by the Supabase security advisor.
-- Internal helpers stay executable by `authenticated` (RLS policies call them as the invoker),
-- but are never callable anonymously. Trigger functions are not callable by API roles at all.

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.current_employee() from public, anon;
revoke execute on function public.current_company_id() from public, anon;
revoke execute on function public.unit_path(uuid) from public, anon;
revoke execute on function public.unit_branch(uuid) from public, anon;
revoke execute on function public.position_unit(uuid) from public, anon;
revoke execute on function public.company_root(uuid) from public, anon;
revoke execute on function public.company_is_writable(uuid) from public, anon;
revoke execute on function public.has_permission(text, uuid, uuid) from public, anon;
revoke execute on function public.current_unit_path() from public, anon;
revoke execute on function public.raise_org(text) from public, anon;
revoke execute on function public.org_units_guard() from public, anon, authenticated;
revoke execute on function public.audit_trigger() from public, anon, authenticated;
