-- 0015: termination — direct by holders of employees.terminate, today or scheduled for a future last working day.

-- True when the employee's position carries roles.manage (an account admin).
create or replace function private.is_admin_employee(p_employee uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.employees e
    join public.positions p on p.id = e.position_id
    join public.role_permissions rp on rp.role_id = p.role_id
    where e.id = p_employee and rp.permission = 'roles.manage'
  )
$$;

-- Executes a termination now (no permission checks: callers check). p_actor = employee id of whoever decided it.
create or replace function private.apply_termination(p_employee uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee for update;
  if v_emp.id is null or v_emp.status <> 'active' then perform public.raise_org('ORG_VALIDATION'); end if;
  update public.employees
     set status = 'terminated', terminated_at = now(), terminated_by = p_actor, position_id = null,
         last_working_day = coalesce(last_working_day, public.today_riyadh())
   where id = p_employee;
  update public.scheduled_actions set status = 'cancelled'
   where employee_id = p_employee and status = 'scheduled';
  perform public.write_audit(v_emp.company_id, 'employee.terminate', 'employee', p_employee,
    jsonb_build_object('position_id', v_emp.position_id),
    jsonb_build_object('reason', v_emp.termination_reason, 'note', v_emp.termination_note,
                       'last_working_day', coalesce(v_emp.last_working_day, public.today_riyadh()), 'by', p_actor));
end
$$;

-- Shared validation for direct termination and request approval. Returns the target row.
create or replace function private.check_termination(p_employee uuid, p_reason text, p_last_day date)
returns public.employees
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_me.id is null or v_emp.id is null or v_emp.company_id <> v_me.company_id then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_emp.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_emp.status <> 'active' or v_emp.id = v_me.id
     or p_reason is null or p_reason not in ('resignation', 'dismissal', 'contract_end', 'probation', 'other')
     or p_last_day is null or p_last_day < public.today_riyadh() then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if private.is_admin_employee(p_employee) and not exists (
    select 1 from public.employees e where e.company_id = v_emp.company_id and e.status = 'active'
      and e.id <> p_employee and private.is_admin_employee(e.id)
  ) then
    perform public.raise_org('ORG_VALIDATION'); -- never leave a company without an account admin
  end if;
  if private.is_admin_employee(p_employee)
     and not public.has_permission('roles.manage', public.company_root(v_emp.company_id)) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  return v_emp;
end
$$;

-- Records the decision and executes it now (last day = today) or schedules it. No permission check (callers check).
create or replace function private.do_termination(p_employee uuid, p_reason text, p_note text, p_last_day date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_emp public.employees := private.check_termination(p_employee, p_reason, p_last_day);
begin
  if exists (select 1 from public.scheduled_actions where employee_id = p_employee and kind = 'termination'
             and status = 'scheduled') then
    perform public.raise_org('ORG_VALIDATION'); -- cancel the existing one first
  end if;
  update public.employees
     set termination_reason = p_reason, termination_note = nullif(trim(p_note), ''), last_working_day = p_last_day
   where id = p_employee;
  if p_last_day = public.today_riyadh() then
    perform private.apply_termination(p_employee, v_me.id);
  else
    insert into public.scheduled_actions (company_id, kind, employee_id, payload, run_at, created_by)
    values (v_emp.company_id, 'termination', p_employee, '{}', p_last_day, v_me.id);
    perform public.write_audit(v_emp.company_id, 'employee.termination_scheduled', 'employee', p_employee, null,
      jsonb_build_object('reason', p_reason, 'last_working_day', p_last_day));
  end if;
end
$$;

create or replace function public.terminate_employee(p_employee uuid, p_reason text, p_note text, p_last_day date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.terminate', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  perform private.do_termination(p_employee, p_reason, p_note, p_last_day);
end
$$;

create or replace function public.cancel_termination(p_employee uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.terminate', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  update public.scheduled_actions set status = 'cancelled'
   where employee_id = p_employee and kind = 'termination' and status = 'scheduled';
  if not found then perform public.raise_org('ORG_VALIDATION'); end if;
  update public.employees set termination_reason = null, termination_note = null, last_working_day = null
   where id = p_employee;
  perform public.write_audit(v_emp.company_id, 'employee.termination_cancelled', 'employee', p_employee);
end
$$;

revoke execute on function private.is_admin_employee(uuid) from public, anon, authenticated;
revoke execute on function private.apply_termination(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.check_termination(uuid, text, date) from public, anon, authenticated;
revoke execute on function private.do_termination(uuid, text, text, date) from public, anon, authenticated;
revoke execute on function public.terminate_employee(uuid, text, text, date) from public, anon;
revoke execute on function public.cancel_termination(uuid) from public, anon;
grant execute on function public.terminate_employee(uuid, text, text, date) to authenticated;
grant execute on function public.cancel_termination(uuid) to authenticated;
