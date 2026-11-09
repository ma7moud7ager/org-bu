-- 0006: encrypted identity numbers, column-level protection, and audit log.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Key source: Supabase Vault secret 'identity_key' when available, else the app.identity_key setting (local tests).
create or replace function private.identity_key()
returns text
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_key using 'identity_key';
  end if;
  v_key := coalesce(v_key, current_setting('app.identity_key', true));
  if v_key is null or v_key = '' then
    raise exception 'identity key is not configured';
  end if;
  return v_key;
end
$$;

-- Column-level protection: the encrypted value is never selectable through the API.
revoke select, insert, update on public.employees from anon, authenticated;
grant select (id, company_id, user_id, position_id, full_name, birth_date, gender, nationality, identity_type,
              identity_last4, iqama_expiry, entry_date, phone, email, contract_start, contract_end, status, created_at)
  on public.employees to authenticated;
grant update (full_name, birth_date, gender, nationality, email, contract_start, contract_end)
  on public.employees to authenticated;

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_company_idx on public.audit_log (company_id, at desc);
alter table public.audit_log enable row level security;
revoke insert, update, delete on public.audit_log from anon, authenticated;
create policy audit_log_select on public.audit_log for select to authenticated
  using (company_id = public.current_company_id()
         and public.has_permission('roles.manage', public.company_root(company_id)));

create or replace function public.write_audit(p_company uuid, p_action text, p_entity text, p_entity_id uuid,
                                              p_before jsonb default null, p_after jsonb default null)
returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.audit_log (company_id, actor_user_id, action, entity, entity_id, before, after)
  values (p_company, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after)
$$;
revoke execute on function public.write_audit(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.validate_identity(p_type text, p_number text)
returns boolean
language sql immutable set search_path = public
as $$
  select case p_type
    when 'national_id' then p_number ~ '^1\d{9}$'
    when 'iqama' then p_number ~ '^2\d{9}$'
    when 'border_number' then p_number ~ '^\d{10}$'
    else false
  end
$$;

create or replace function public.set_employee_identity(p_employee uuid, p_identity_type text, p_number text,
                                                        p_iqama_expiry date, p_entry_date date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
  v_me public.employees := public.current_employee();
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_me.id is null or v_emp.company_id <> v_me.company_id then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if v_emp.id <> v_me.id and not public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.validate_identity(p_identity_type, p_number)
     or (p_identity_type = 'iqama' and p_iqama_expiry is null)
     or (p_identity_type = 'border_number' and p_entry_date is null) then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  update public.employees
     set identity_type = p_identity_type,
         identity_number_enc = pgp_sym_encrypt(p_number, private.identity_key()),
         identity_last4 = right(p_number, 4),
         iqama_expiry = case when p_identity_type = 'iqama' then p_iqama_expiry end,
         entry_date = case when p_identity_type = 'border_number' then p_entry_date else entry_date end
   where id = p_employee;

  perform public.write_audit(v_emp.company_id, 'identity.set', 'employee', p_employee);
end
$$;

create or replace function public.get_employee_identity_number(p_employee uuid)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.view_sensitive', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  perform public.write_audit(v_emp.company_id, 'identity.read', 'employee', p_employee);
  if v_emp.identity_number_enc is null then return null; end if;
  return pgp_sym_decrypt(v_emp.identity_number_enc, private.identity_key());
end
$$;

revoke execute on function public.set_employee_identity(uuid, text, text, date, date) from public, anon;
revoke execute on function public.get_employee_identity_number(uuid) from public, anon;
grant execute on function public.set_employee_identity(uuid, text, text, date, date) to authenticated;
grant execute on function public.get_employee_identity_number(uuid) to authenticated;

-- Audit triggers.
create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_company uuid;
begin
  if tg_table_name = 'employees' then
    perform public.write_audit(new.company_id, 'employee.update', 'employee', new.id,
      jsonb_build_object('status', old.status, 'position_id', old.position_id),
      jsonb_build_object('status', new.status, 'position_id', new.position_id));
    return new;
  elsif tg_table_name = 'role_permissions' then
    select company_id into v_company from public.roles where id = coalesce(new.role_id, old.role_id);
    perform public.write_audit(v_company, 'role_permission.' || lower(tg_op), 'role', coalesce(new.role_id, old.role_id),
      case when tg_op = 'DELETE' then jsonb_build_object('permission', old.permission, 'scope', old.scope) end,
      case when tg_op = 'INSERT' then jsonb_build_object('permission', new.permission, 'scope', new.scope) end);
    return coalesce(new, old);
  elsif tg_table_name = 'org_units' then
    perform public.write_audit(old.company_id, 'org_unit.delete', 'org_unit', old.id, to_jsonb(old), null);
    return old;
  end if;
  return coalesce(new, old);
end
$$;

create trigger employees_audit after update of status, position_id on public.employees
  for each row when (old.status is distinct from new.status or old.position_id is distinct from new.position_id)
  execute function public.audit_trigger();
create trigger role_permissions_audit after insert or delete on public.role_permissions
  for each row execute function public.audit_trigger();
create trigger org_units_audit after delete on public.org_units
  for each row execute function public.audit_trigger();
