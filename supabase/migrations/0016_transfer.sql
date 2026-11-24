-- 0016: transfer (immediate or scheduled; vacant position or a new one), permission holders, notifications,
-- and the daily runner for scheduled actions.

-- Active employees of a company whose role grants p_permission with a scope covering p_unit (mirrors has_permission).
create or replace function private.permission_holders(p_company uuid, p_permission text, p_unit uuid)
returns table (employee_id uuid, user_id uuid)
language sql stable security definer set search_path = public, extensions
as $$
  select distinct e.id, e.user_id
  from public.employees e
  join public.positions p on p.id = e.position_id
  join public.role_permissions rp on rp.role_id = p.role_id and rp.permission = p_permission
  where e.company_id = p_company and e.status = 'active'
    and (
      rp.scope = 'company'
      or (rp.scope = 'branch' and public.unit_branch(p.org_unit_id) is not null
          and public.unit_branch(p.org_unit_id) = public.unit_branch(p_unit))
      or (rp.scope = 'unit' and p_unit is not null
          and (public.unit_path(p_unit))[1:cardinality(public.unit_path(p.org_unit_id))] = public.unit_path(p.org_unit_id))
    )
$$;

create or replace function private.notify(p_user uuid, p_company uuid, p_type text, p_payload jsonb)
returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.notifications (user_id, company_id, type, payload) values (p_user, p_company, p_type, p_payload)
$$;

-- Executes a transfer now. p_payload: {target_position} or {new_unit, new_title, new_role}. Returns the position id.
create or replace function private.apply_transfer(p_employee uuid, p_payload jsonb, p_actor uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
  v_target uuid := nullif(p_payload ->> 'target_position', '')::uuid;
  v_pos public.positions;
  v_old uuid;
begin
  select * into v_emp from public.employees where id = p_employee for update;
  if v_emp.id is null or v_emp.status <> 'active' then perform public.raise_org('ORG_VALIDATION'); end if;
  v_old := v_emp.position_id;
  if v_target is not null then
    select * into v_pos from public.positions where id = v_target for update;
    if v_pos.id is null or v_pos.company_id <> v_emp.company_id then perform public.raise_org('ORG_VALIDATION'); end if;
    if exists (select 1 from public.employees where position_id = v_target) then
      perform public.raise_org('ORG_POSITION_FILLED');
    end if;
  else
    insert into public.positions (company_id, org_unit_id, title, role_id)
    values (v_emp.company_id, (p_payload ->> 'new_unit')::uuid, trim(p_payload ->> 'new_title'), (p_payload ->> 'new_role')::uuid)
    returning id into v_target;
  end if;
  update public.employees set position_id = v_target where id = p_employee;
  delete from public.invitations where position_id = v_target and used_at is null;
  perform public.write_audit(v_emp.company_id, 'employee.transfer', 'employee', p_employee,
    jsonb_build_object('position_id', v_old), jsonb_build_object('position_id', v_target, 'by', p_actor));
  return v_target;
end
$$;

-- Validates a transfer for the current user (direct execution rights on source and destination). Returns the payload.
create or replace function private.check_transfer(p_employee uuid, p_target_position uuid, p_new_unit uuid,
                                                  p_new_title text, p_new_role uuid, p_run_at date)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_emp public.employees;
  v_pos public.positions;
  v_dest_unit uuid;
  v_dest_role uuid;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_me.id is null or v_emp.id is null or v_emp.company_id <> v_me.company_id
     or not public.has_permission('employees.transfer', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_emp.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_emp.status <> 'active' or (p_run_at is not null and p_run_at < public.today_riyadh())
     or (p_target_position is null) = (p_new_unit is null)
     or (p_new_unit is not null and (coalesce(length(trim(p_new_title)), 0) < 2 or p_new_role is null)) then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  if p_target_position is not null then
    select * into v_pos from public.positions where id = p_target_position;
    if v_pos.id is null or v_pos.company_id <> v_emp.company_id then perform public.raise_org('ORG_FORBIDDEN'); end if;
    if v_pos.id = v_emp.position_id then perform public.raise_org('ORG_VALIDATION'); end if;
    if exists (select 1 from public.employees where position_id = v_pos.id) then
      perform public.raise_org('ORG_POSITION_FILLED');
    end if;
    v_dest_unit := v_pos.org_unit_id;
    v_dest_role := v_pos.role_id;
  else
    if not exists (select 1 from public.org_units where id = p_new_unit and company_id = v_emp.company_id) then
      perform public.raise_org('ORG_FORBIDDEN');
    end if;
    v_dest_unit := p_new_unit;
    v_dest_role := p_new_role;
  end if;
  if not public.has_permission('employees.transfer', v_dest_unit) or not public.can_assign_role(v_dest_role) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  -- Moving an account admin needs roles.manage, and the last admin cannot leave the admin role.
  if private.is_admin_employee(p_employee) then
    if not public.has_permission('roles.manage', public.company_root(v_emp.company_id)) then
      perform public.raise_org('ORG_FORBIDDEN');
    end if;
    if not exists (select 1 from public.role_permissions where role_id = v_dest_role and permission = 'roles.manage')
       and not exists (select 1 from public.employees e where e.company_id = v_emp.company_id and e.status = 'active'
                       and e.id <> p_employee and private.is_admin_employee(e.id)) then
      perform public.raise_org('ORG_VALIDATION');
    end if;
  end if;

  if p_target_position is not null then
    return jsonb_build_object('target_position', p_target_position);
  end if;
  return jsonb_build_object('new_unit', p_new_unit, 'new_title', trim(p_new_title), 'new_role', p_new_role);
end
$$;

create or replace function public.transfer_employee(p_employee uuid, p_target_position uuid, p_new_unit uuid,
                                                    p_new_title text, p_new_role uuid, p_run_at date)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_payload jsonb := private.check_transfer(p_employee, p_target_position, p_new_unit, p_new_title, p_new_role, p_run_at);
begin
  if p_run_at is null or p_run_at <= public.today_riyadh() then
    return private.apply_transfer(p_employee, v_payload, v_me.id);
  end if;
  if exists (select 1 from public.scheduled_actions where employee_id = p_employee and kind = 'transfer'
             and status = 'scheduled') then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  insert into public.scheduled_actions (company_id, kind, employee_id, payload, run_at, created_by)
  values (v_me.company_id, 'transfer', p_employee, v_payload, p_run_at, v_me.id);
  perform public.write_audit(v_me.company_id, 'employee.transfer_scheduled', 'employee', p_employee, null,
    v_payload || jsonb_build_object('run_at', p_run_at));
  return null;
end
$$;

create or replace function public.cancel_scheduled_action(p_action uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_act public.scheduled_actions;
  v_emp public.employees;
begin
  select * into v_act from public.scheduled_actions where id = p_action;
  if v_act.id is null or v_act.company_id is distinct from public.current_company_id() then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if v_act.kind = 'termination' then
    perform public.cancel_termination(v_act.employee_id);
    return;
  end if;
  select * into v_emp from public.employees where id = v_act.employee_id;
  if not public.has_permission('employees.transfer', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if v_act.status <> 'scheduled' then perform public.raise_org('ORG_VALIDATION'); end if;
  update public.scheduled_actions set status = 'cancelled' where id = p_action;
  perform public.write_audit(v_act.company_id, 'employee.transfer_cancelled', 'employee', v_act.employee_id);
end
$$;

-- Daily (pg_cron): executes due actions; a failing action is marked failed and HR is notified. Returns executed count.
create or replace function public.run_scheduled_actions()
returns int
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_act public.scheduled_actions;
  v_done int := 0;
  v_name text;
  h record;
begin
  for v_act in
    select * from public.scheduled_actions where status = 'scheduled' and run_at <= public.today_riyadh()
    order by run_at, created_at for update skip locked
  loop
    begin
      if v_act.kind = 'termination' then
        perform private.apply_termination(v_act.employee_id, v_act.created_by);
      else
        perform private.apply_transfer(v_act.employee_id, v_act.payload, v_act.created_by);
      end if;
      update public.scheduled_actions set status = 'done', executed_at = now() where id = v_act.id;
      v_done := v_done + 1;
    exception when others then
      update public.scheduled_actions set status = 'failed', executed_at = now(), error = sqlerrm where id = v_act.id;
      select full_name into v_name from public.employees where id = v_act.employee_id;
      for h in select * from private.permission_holders(v_act.company_id,
                 case v_act.kind when 'termination' then 'employees.terminate' else 'employees.transfer' end,
                 public.company_root(v_act.company_id)) loop
        perform private.notify(h.user_id, v_act.company_id, 'scheduled_failed',
          jsonb_build_object('action_id', v_act.id, 'kind', v_act.kind, 'employee_id', v_act.employee_id,
                             'employee_name', v_name, 'error', sqlerrm));
      end loop;
    end;
  end loop;
  return v_done;
end
$$;

revoke execute on function private.permission_holders(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.notify(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.apply_transfer(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function private.check_transfer(uuid, uuid, uuid, text, uuid, date) from public, anon, authenticated;
revoke execute on function public.run_scheduled_actions() from public, anon, authenticated;
revoke execute on function public.transfer_employee(uuid, uuid, uuid, text, uuid, date) from public, anon;
revoke execute on function public.cancel_scheduled_action(uuid) from public, anon;
grant execute on function public.transfer_employee(uuid, uuid, uuid, text, uuid, date) to authenticated;
grant execute on function public.cancel_scheduled_action(uuid) to authenticated;
