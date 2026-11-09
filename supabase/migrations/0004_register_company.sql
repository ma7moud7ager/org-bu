-- 0004: company self-registration in one transaction.

-- Mirrors DEFAULT_ROLE_GRANTS in packages/shared/src/permissions.ts (a test asserts equality).
create or replace function public.default_role_grants()
returns table (system_key text, permission text, scope text)
language sql immutable set search_path = public
as $$
  select * from (values
    ('company_admin', 'structure.manage', 'company'),
    ('company_admin', 'roles.manage', 'company'),
    ('company_admin', 'employees.invite', 'company'),
    ('company_admin', 'employees.view', 'company'),
    ('company_admin', 'employees.edit', 'company'),
    ('company_admin', 'employees.terminate', 'company'),
    ('company_admin', 'employees.view_sensitive', 'company'),
    ('company_admin', 'announcements.publish', 'company'),
    ('company_admin', 'subscription.view', 'company'),
    ('hr', 'employees.invite', 'company'),
    ('hr', 'employees.view', 'company'),
    ('hr', 'employees.edit', 'company'),
    ('hr', 'employees.terminate', 'company'),
    ('hr', 'employees.view_sensitive', 'company'),
    ('hr', 'announcements.publish', 'company'),
    ('hr', 'structure.manage', 'company'),
    ('finance', 'employees.view', 'company'),
    ('branch_manager', 'employees.invite', 'branch'),
    ('branch_manager', 'employees.view', 'branch'),
    ('branch_manager', 'employees.edit', 'branch'),
    ('branch_manager', 'announcements.publish', 'branch'),
    ('unit_manager', 'employees.view', 'unit'),
    ('unit_manager', 'announcements.publish', 'unit'),
    ('employee', 'employees.view', 'self')
  ) as g (system_key, permission, scope)
$$;

create or replace function public.register_company(
  p_legal_name text,
  p_cr_number text,
  p_employee_count int,
  p_activity_type text,
  p_selected_catalog_ids uuid[],
  p_admin_full_name text,
  p_admin_phone text,
  p_admin_email text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_root uuid;
  v_admin_role uuid;
  v_position uuid;
  v_role_names constant jsonb := jsonb_build_object(
    'company_admin', 'مدير حساب الشركة', 'hr', 'الموارد البشرية', 'finance', 'المالية',
    'branch_manager', 'مدير فرع', 'unit_manager', 'مدير إدارة', 'employee', 'موظف');
  k text;
  v_role uuid;
begin
  if v_user is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if exists (select 1 from public.employees where user_id = v_user) then perform public.raise_org('ORG_VALIDATION'); end if;
  if p_cr_number !~ '^\d{10}$' or coalesce(length(trim(p_legal_name)), 0) < 2
     or p_activity_type not in ('commercial', 'service', 'mixed') or p_employee_count < 1 then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if exists (select 1 from public.companies where cr_number = p_cr_number) then perform public.raise_org('ORG_CR_TAKEN'); end if;
  if exists (select 1 from public.employees where phone = p_admin_phone) then perform public.raise_org('ORG_PHONE_TAKEN'); end if;
  if p_admin_email is not null and exists (select 1 from public.employees where email = lower(p_admin_email)) then
    perform public.raise_org('ORG_EMAIL_TAKEN');
  end if;

  insert into public.companies (legal_name, cr_number, employee_count, activity_type)
  values (trim(p_legal_name), p_cr_number, p_employee_count, p_activity_type)
  returning id into v_company;

  insert into public.subscriptions (company_id, status, starts_at, ends_at)
  values (v_company, 'trial', now(), now() + interval '14 days');

  for k in select jsonb_object_keys(v_role_names) loop
    insert into public.roles (company_id, name, system_key) values (v_company, v_role_names ->> k, k) returning id into v_role;
    insert into public.role_permissions (role_id, permission, scope)
      select v_role, g.permission, g.scope from public.default_role_grants() g where g.system_key = k;
    if k = 'company_admin' then v_admin_role := v_role; end if;
  end loop;

  insert into public.org_units (company_id, type, name, is_fixed, catalog_id)
  values (v_company, 'department', 'الإدارة العامة', true,
          (select id from public.department_catalog where name_ar = 'الإدارة العامة'))
  returning id into v_root;

  insert into public.org_units (company_id, parent_id, type, name, is_fixed, catalog_id)
  select v_company, v_root, 'department', c.name_ar, true, c.id
  from public.department_catalog c where c.is_fixed and c.name_ar <> 'الإدارة العامة';

  if p_activity_type in ('commercial', 'mixed') then
    insert into public.org_units (company_id, parent_id, type, name, is_fixed)
    values (v_company, v_root, 'branch', 'الفرع الرئيسي', false);
  end if;

  insert into public.org_units (company_id, parent_id, type, name, is_fixed, catalog_id)
  select v_company, v_root, 'department', c.name_ar, false, c.id
  from public.department_catalog c
  where c.id = any (coalesce(p_selected_catalog_ids, '{}')) and not c.is_fixed;

  insert into public.positions (company_id, org_unit_id, title, role_id, is_manager)
  values (v_company, v_root, 'مدير الحساب', v_admin_role, true)
  returning id into v_position;

  update public.org_units set manager_position_id = v_position where id = v_root;

  insert into public.employees (company_id, user_id, position_id, full_name, phone, email)
  values (v_company, v_user, v_position, trim(p_admin_full_name), p_admin_phone, lower(p_admin_email));

  return v_company;
end
$$;

revoke execute on function public.register_company(text, text, int, text, uuid[], text, text, text) from anon, public;
grant execute on function public.register_company(text, text, int, text, uuid[], text, text, text) to authenticated;
