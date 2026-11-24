-- 0018: validated profile and document edits. Direct column updates are withdrawn so every edit passes validation.

revoke update (full_name, birth_date, gender, nationality, email, contract_start, contract_end) on public.employees from authenticated;

create or replace function public.update_employee_profile(p_employee uuid, p_full_name text, p_birth_date date, p_gender text,
                                                          p_nationality text, p_email text,
                                                          p_contract_start date, p_contract_end date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
  v_email text := nullif(lower(trim(p_email)), '');
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_emp.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if coalesce(length(trim(p_full_name)), 0) < 3
     or (p_gender is not null and p_gender not in ('male', 'female'))
     or (p_nationality is not null and p_nationality !~ '^[A-Z]{2}$')
     or (p_nationality is not null and v_emp.identity_type is not null
         and (p_nationality = 'SA') <> (v_emp.identity_type = 'national_id'))
     or (p_birth_date is not null and (p_birth_date > (current_date - interval '15 years')
                                       or p_birth_date < (current_date - interval '80 years')))
     or (v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
     or (p_contract_start is not null and p_contract_end is not null and p_contract_end < p_contract_start) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if v_email is not null and exists (select 1 from public.employees where email = v_email and id <> p_employee) then
    perform public.raise_org('ORG_EMAIL_TAKEN');
  end if;

  update public.employees
     set full_name = trim(p_full_name), birth_date = p_birth_date, gender = p_gender, nationality = p_nationality,
         email = v_email, contract_start = p_contract_start, contract_end = p_contract_end
   where id = p_employee;
  perform public.write_audit(v_emp.company_id, 'employee.profile_update', 'employee', p_employee,
    jsonb_build_object('full_name', v_emp.full_name, 'birth_date', v_emp.birth_date, 'gender', v_emp.gender,
                       'nationality', v_emp.nationality, 'email', v_emp.email,
                       'contract_start', v_emp.contract_start, 'contract_end', v_emp.contract_end),
    jsonb_build_object('full_name', trim(p_full_name), 'birth_date', p_birth_date, 'gender', p_gender,
                       'nationality', p_nationality, 'email', v_email,
                       'contract_start', p_contract_start, 'contract_end', p_contract_end));
end
$$;

-- HR path (employees.edit) or self. Self may only renew an iqama or convert a border number to an iqama; HR is notified.
create or replace function public.update_employee_document(p_employee uuid, p_identity_type text, p_number text,
                                                           p_iqama_expiry date, p_entry_date date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_emp public.employees;
  v_self boolean;
  h record;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_me.id is null or v_emp.id is null or v_emp.company_id <> v_me.company_id then perform public.raise_org('ORG_FORBIDDEN'); end if;
  v_self := v_emp.id = v_me.id;
  if not v_self and not public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_emp.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_self and not public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id)
     and (p_identity_type is distinct from 'iqama' or v_emp.identity_type not in ('iqama', 'border_number')) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if v_emp.nationality is not null and (v_emp.nationality = 'SA') <> (p_identity_type = 'national_id') then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  perform public.set_employee_identity(p_employee, p_identity_type, p_number, p_iqama_expiry, p_entry_date);

  if v_self then
    for h in select * from private.permission_holders(v_emp.company_id, 'employees.view_sensitive',
                                                       public.position_unit(v_emp.position_id)) loop
      if h.employee_id <> v_emp.id then
        perform private.notify(h.user_id, v_emp.company_id, 'document_updated',
          jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name,
                             'identity_type', p_identity_type, 'iqama_expiry', p_iqama_expiry));
      end if;
    end loop;
  end if;
end
$$;

create or replace function public.update_my_document(p_identity_type text, p_number text, p_iqama_expiry date, p_entry_date date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  perform public.update_employee_document(v_me.id, p_identity_type, p_number, p_iqama_expiry, p_entry_date);
end
$$;

create or replace function public.update_my_email(p_email text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_email text := nullif(lower(trim(p_email)), '');
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform public.raise_org('ORG_VALIDATION'); end if;
  if v_email is not null and exists (select 1 from public.employees where email = v_email and id <> v_me.id) then
    perform public.raise_org('ORG_EMAIL_TAKEN');
  end if;
  update public.employees set email = v_email where id = v_me.id;
  perform public.write_audit(v_me.company_id, 'employee.email_update', 'employee', v_me.id,
    jsonb_build_object('email', v_me.email), jsonb_build_object('email', v_email));
end
$$;

revoke execute on function public.update_employee_profile(uuid, text, date, text, text, text, date, date) from public, anon;
revoke execute on function public.update_employee_document(uuid, text, text, date, date) from public, anon;
revoke execute on function public.update_my_document(text, text, date, date) from public, anon;
revoke execute on function public.update_my_email(text) from public, anon;
grant execute on function public.update_employee_profile(uuid, text, date, text, text, text, date, date) to authenticated;
grant execute on function public.update_employee_document(uuid, text, text, date, date) to authenticated;
grant execute on function public.update_my_document(text, text, date, date) to authenticated;
grant execute on function public.update_my_email(text) to authenticated;
