-- 0003: helper functions and row-level security for tenant tables.

create or replace function public.current_employee()
returns public.employees
language sql stable security definer set search_path = public
as $$
  select * from public.employees where user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function public.current_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.employees where user_id = auth.uid() and status = 'active' limit 1
$$;

create or replace function public.unit_path(p_unit uuid)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, parent_id, 0 as depth from public.org_units where id = p_unit
    union all
    select u.id, u.parent_id, up.depth + 1 from public.org_units u join up on u.id = up.parent_id
    where up.depth < 100
  )
  select coalesce(array_agg(id order by depth desc), '{}') from up
$$;

create or replace function public.unit_branch(p_unit uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  with recursive up as (
    select id, parent_id, type, 0 as depth from public.org_units where id = p_unit
    union all
    select u.id, u.parent_id, u.type, up.depth + 1 from public.org_units u join up on u.id = up.parent_id
    where up.depth < 100
  )
  select id from up where type = 'branch' order by depth limit 1
$$;

create or replace function public.position_unit(p_position uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select org_unit_id from public.positions where id = p_position
$$;

create or replace function public.company_root(p_company uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.org_units where company_id = p_company and parent_id is null
$$;

create or replace function public.company_is_writable(p_company uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    join public.companies c on c.id = s.company_id
    where s.company_id = p_company
      and c.status = 'active'
      and s.status in ('trial', 'active')
      and (s.ends_at is null or s.ends_at > now())
  )
$$;

-- Mirrors hasPermission() in packages/shared/src/permissions.ts.
create or replace function public.has_permission(p_permission text, p_target_unit uuid, p_target_employee uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_emp public.employees;
  v_actor_unit uuid;
  v_actor_path uuid[];
  v_actor_branch uuid;
  v_target_path uuid[];
  v_target_branch uuid;
begin
  v_emp := public.current_employee();
  if v_emp.id is null or v_emp.position_id is null then
    return false;
  end if;
  if p_target_unit is not null and not exists (
    select 1 from public.org_units where id = p_target_unit and company_id = v_emp.company_id
  ) then
    return false;
  end if;

  v_actor_unit := public.position_unit(v_emp.position_id);
  v_actor_path := public.unit_path(v_actor_unit);
  v_actor_branch := public.unit_branch(v_actor_unit);
  v_target_path := public.unit_path(p_target_unit);
  v_target_branch := public.unit_branch(p_target_unit);

  return exists (
    select 1
    from public.positions p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = v_emp.position_id
      and rp.permission = p_permission
      and (
        rp.scope = 'company'
        or (rp.scope = 'branch' and v_actor_branch is not null and v_actor_branch = v_target_branch)
        or (rp.scope = 'unit' and p_target_unit is not null
            and v_target_path[1:cardinality(v_actor_path)] = v_actor_path)
        or (rp.scope = 'self' and p_target_employee is not null and p_target_employee = v_emp.id)
      )
  );
end
$$;

-- Raise a stable error code (mapped to Arabic in packages/shared/src/errors.ts).
create or replace function public.raise_org(p_code text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end
$$;

alter table public.companies enable row level security;
alter table public.subscriptions enable row level security;
alter table public.org_units enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;

-- Read access: members of the same company, or the platform owner.
create policy companies_select on public.companies for select to authenticated
  using (id = public.current_company_id() or public.is_platform_admin());
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (company_id = public.current_company_id() or public.is_platform_admin());
create policy org_units_select on public.org_units for select to authenticated
  using (company_id = public.current_company_id() or public.is_platform_admin());
create policy roles_select on public.roles for select to authenticated
  using (company_id = public.current_company_id() or public.is_platform_admin());
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and (r.company_id = public.current_company_id() or public.is_platform_admin())));
create policy positions_select on public.positions for select to authenticated
  using (company_id = public.current_company_id() or public.is_platform_admin());
create policy employees_select on public.employees for select to authenticated
  using (
    public.is_platform_admin()
    or (company_id = public.current_company_id()
        and public.has_permission('employees.view', public.position_unit(position_id), id))
  );

-- Platform owner manages subscriptions.
create policy subscriptions_update on public.subscriptions for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Structure writes.
create policy org_units_insert on public.org_units for insert to authenticated
  with check (company_id = public.current_company_id() and public.company_is_writable(company_id)
              and parent_id is not null and public.has_permission('structure.manage', parent_id));
create policy org_units_update on public.org_units for update to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('structure.manage', id))
  with check (company_id = public.current_company_id());
create policy org_units_delete on public.org_units for delete to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('structure.manage', id));

create policy positions_insert on public.positions for insert to authenticated
  with check (company_id = public.current_company_id() and public.company_is_writable(company_id)
              and public.has_permission('structure.manage', org_unit_id));
create policy positions_update on public.positions for update to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('structure.manage', org_unit_id))
  with check (company_id = public.current_company_id() and public.has_permission('structure.manage', org_unit_id));
create policy positions_delete on public.positions for delete to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('structure.manage', org_unit_id));

create policy roles_write on public.roles for all to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('roles.manage', public.company_root(company_id)))
  with check (company_id = public.current_company_id() and public.company_is_writable(company_id)
              and public.has_permission('roles.manage', public.company_root(company_id)));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id
                 and r.company_id = public.current_company_id()
                 and public.company_is_writable(r.company_id)
                 and public.has_permission('roles.manage', public.company_root(r.company_id))))
  with check (exists (select 1 from public.roles r where r.id = role_id
                      and r.company_id = public.current_company_id()
                      and public.company_is_writable(r.company_id)
                      and public.has_permission('roles.manage', public.company_root(r.company_id))));

create policy employees_update on public.employees for update to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('employees.edit', public.position_unit(position_id), id))
  with check (company_id = public.current_company_id());
