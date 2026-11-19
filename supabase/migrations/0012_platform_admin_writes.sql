-- 0012: platform owner can suspend/reactivate companies and see a cross-company overview.

revoke update on public.companies from anon, authenticated;
grant update (status) on public.companies to authenticated;
create policy companies_update_owner on public.companies for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.admin_company_overview()
returns table (company_id uuid, legal_name text, cr_number text, activity_type text, status text,
               sub_status text, plan_id uuid, plan_name text, ends_at timestamptz, employee_count bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions
as $$
begin
  if not public.is_platform_admin() then perform public.raise_org('ORG_FORBIDDEN'); end if;
  return query
    select c.id, c.legal_name, c.cr_number, c.activity_type, c.status,
           s.status, s.plan_id, p.name, s.ends_at,
           (select count(*) from public.employees e where e.company_id = c.id and e.status = 'active'),
           c.created_at
    from public.companies c
    left join public.subscriptions s on s.company_id = c.id
    left join public.plans p on p.id = s.plan_id
    order by c.created_at desc;
end
$$;
revoke execute on function public.admin_company_overview() from public, anon;
grant execute on function public.admin_company_overview() to authenticated;
