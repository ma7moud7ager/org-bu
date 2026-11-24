-- 0023: one-phone binding per employee, device_change requests through the requests engine.

create table public.employee_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id),
  device_id text not null,
  platform text not null check (platform in ('android', 'ios')),
  model text,
  push_token text,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'revoked'))
);
create unique index employee_devices_one_active on public.employee_devices (employee_id) where status = 'active';
create index employee_devices_employee_idx on public.employee_devices (employee_id);
create index employee_devices_company_idx on public.employee_devices (company_id);
create index employee_devices_token_idx on public.employee_devices (push_token) where push_token is not null;
alter table public.employee_devices enable row level security;
revoke insert, update, delete on public.employee_devices from anon, authenticated;
revoke select on public.employee_devices from anon, authenticated;
grant select (id, company_id, employee_id, device_id, platform, model, bound_at, last_seen_at, status)
  on public.employee_devices to authenticated;
create policy employee_devices_select on public.employee_devices for select to authenticated
  using (company_id = public.current_company_id()
         and exists (select 1 from public.employees e where e.id = employee_id
                     and (e.id = (public.current_employee()).id
                          or public.has_permission('employees.view', public.position_unit(e.position_id), e.id))));

alter table public.requests drop constraint requests_type_check;
alter table public.requests add constraint requests_type_check check (type in ('termination', 'transfer', 'device_change'));

-- Moves the binding to the phone in p_payload (revoking any other active phone).
create or replace function private.apply_device_change(p_employee uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  update public.employee_devices set status = 'revoked', push_token = null
   where employee_id = p_employee and status = 'active';
  insert into public.employee_devices (company_id, employee_id, device_id, platform, model)
  values (v_emp.company_id, p_employee, p_payload ->> 'device_id', p_payload ->> 'platform', p_payload ->> 'model');
  perform public.write_audit(v_emp.company_id, 'device.change', 'employee', p_employee, null, p_payload);
end
$$;

create or replace function public.register_device(p_device_id text, p_platform text, p_model text, p_push_token text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_dev public.employee_devices;
  v_req uuid;
  v_payload jsonb;
  h record;
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if coalesce(length(trim(p_device_id)), 0) < 4 or p_platform is null or p_platform not in ('android', 'ios') then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  select * into v_dev from public.employee_devices where employee_id = v_me.id and status = 'active' for update;

  if v_dev.id is null or v_dev.device_id = p_device_id then
    if p_push_token is not null then
      update public.employee_devices set push_token = null where push_token = p_push_token;
    end if;
    if v_dev.id is null then
      insert into public.employee_devices (company_id, employee_id, device_id, platform, model, push_token)
      values (v_me.company_id, v_me.id, p_device_id, p_platform, p_model, p_push_token);
      perform public.write_audit(v_me.company_id, 'device.bind', 'employee', v_me.id, null,
        jsonb_build_object('device_id', p_device_id, 'model', p_model));
      return 'bound';
    end if;
    update public.employee_devices
       set push_token = coalesce(p_push_token, push_token), model = coalesce(p_model, model), last_seen_at = now()
     where id = v_dev.id;
    return 'ok';
  end if;

  v_payload := jsonb_build_object('device_id', p_device_id, 'platform', p_platform, 'model', p_model);
  select id into v_req from public.requests
   where subject_employee_id = v_me.id and type = 'device_change' and status in ('pending', 'postponed');
  if v_req is null then
    insert into public.requests (company_id, type, requester_employee_id, subject_employee_id, payload)
    values (v_me.company_id, 'device_change', v_me.id, v_me.id, v_payload) returning id into v_req;
    insert into public.request_events (request_id, actor_employee_id, action, payload) values (v_req, v_me.id, 'submitted', v_payload);
    for h in select * from private.permission_holders(v_me.company_id, 'requests.decide', public.position_unit(v_me.position_id)) loop
      perform private.notify(h.user_id, v_me.company_id, 'request_new',
        jsonb_build_object('request_id', v_req, 'type', 'device_change', 'subject_name', v_me.full_name, 'requester_name', v_me.full_name));
    end loop;
  else
    update public.requests set payload = v_payload where id = v_req;
  end if;
  return 'mismatch';
end
$$;

create or replace function public.unbind_device(p_employee uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  update public.employee_devices set status = 'revoked', push_token = null where employee_id = p_employee and status = 'active';
  perform public.write_audit(v_emp.company_id, 'device.unbind', 'employee', p_employee);
end
$$;

create or replace function private.device_json(p_employee uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select case when d.id is null then jsonb_build_object('status', 'none')
              else jsonb_build_object('status', 'active', 'device_id', d.device_id, 'platform', d.platform,
                                      'model', d.model, 'bound_at', d.bound_at, 'last_seen_at', d.last_seen_at,
                                      'push', d.push_token is not null) end
         || jsonb_build_object('pending_change', exists (select 1 from public.requests q where q.subject_employee_id = p_employee
                                                         and q.type = 'device_change' and q.status in ('pending', 'postponed')))
  from (select 1) x left join public.employee_devices d on d.employee_id = p_employee and d.status = 'active'
$$;

create or replace function public.my_device()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  return private.device_json(v_me.id);
end
$$;

create or replace function public.employee_device(p_employee uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_emp public.employees;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null or v_emp.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.view', public.position_unit(v_emp.position_id), v_emp.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  return private.device_json(p_employee);
end
$$;

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
  update public.employee_devices set status = 'revoked', push_token = null
   where employee_id = p_employee and status = 'active';
  perform public.write_audit(v_emp.company_id, 'employee.terminate', 'employee', p_employee,
    jsonb_build_object('position_id', v_emp.position_id),
    jsonb_build_object('reason', v_emp.termination_reason, 'note', v_emp.termination_note,
                       'last_working_day', coalesce(v_emp.last_working_day, public.today_riyadh()), 'by', p_actor));
end
$$;

-- Shared validation for direct termination and request approval. Returns the target row.

create or replace function private.normalize_request_payload(p_company uuid, p_type text, p_payload jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_last date;
  v_run date;
  v_target uuid;
  v_unit uuid;
  v_role uuid;
begin
  begin
    if p_type = 'termination' then
      v_last := (p_payload ->> 'last_day')::date;
      if (p_payload ->> 'reason') is null
         or (p_payload ->> 'reason') not in ('resignation', 'dismissal', 'contract_end', 'probation', 'other')
         or v_last is null or v_last < public.today_riyadh() then
        perform public.raise_org('ORG_VALIDATION');
      end if;
      return jsonb_build_object('reason', p_payload ->> 'reason', 'note', coalesce(trim(p_payload ->> 'note'), ''),
                                'last_day', v_last);
    elsif p_type = 'device_change' then
      if coalesce(length(p_payload ->> 'device_id'), 0) < 4 or (p_payload ->> 'platform') not in ('android', 'ios') then
        perform public.raise_org('ORG_VALIDATION');
      end if;
      return jsonb_build_object('device_id', p_payload ->> 'device_id', 'platform', p_payload ->> 'platform',
                                'model', p_payload ->> 'model');
    elsif p_type = 'transfer' then
      v_target := nullif(p_payload ->> 'target_position', '')::uuid;
      v_unit := nullif(p_payload ->> 'new_unit', '')::uuid;
      v_role := nullif(p_payload ->> 'new_role', '')::uuid;
      v_run := nullif(p_payload ->> 'run_at', '')::date;
    else
      perform public.raise_org('ORG_VALIDATION');
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform public.raise_org('ORG_VALIDATION');
  end;

  if (v_target is null) = (v_unit is null) or (v_run is not null and v_run < public.today_riyadh()) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if v_target is not null then
    if not exists (select 1 from public.positions where id = v_target and company_id = p_company) then
      perform public.raise_org('ORG_FORBIDDEN');
    end if;
    if exists (select 1 from public.employees where position_id = v_target) then
      perform public.raise_org('ORG_POSITION_FILLED');
    end if;
    return jsonb_build_object('target_position', v_target, 'run_at', v_run);
  end if;
  if coalesce(length(trim(p_payload ->> 'new_title')), 0) < 2
     or not exists (select 1 from public.org_units where id = v_unit and company_id = p_company)
     or not exists (select 1 from public.roles where id = v_role and company_id = p_company) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  return jsonb_build_object('new_unit', v_unit, 'new_title', trim(p_payload ->> 'new_title'), 'new_role', v_role,
                            'run_at', v_run);
end
$$;


create or replace function public.decide_request(p_request uuid, p_decision text, p_note text,
                                                 p_payload jsonb default null, p_postpone_until date default null)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_req public.requests;
  v_sub public.employees;
  v_payload jsonb;
  v_status text;
  v_requester uuid;
begin
  select * into v_req from public.requests where id = p_request for update;
  if v_me.id is null or v_req.id is null or v_req.company_id <> v_me.company_id then perform public.raise_org('ORG_FORBIDDEN'); end if;
  select * into v_sub from public.employees where id = v_req.subject_employee_id;
  if not public.has_permission('requests.decide', public.position_unit(v_sub.position_id), v_sub.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if v_req.status not in ('pending', 'postponed') then perform public.raise_org('ORG_VALIDATION'); end if;

  if p_decision = 'approve' then
    if v_sub.status <> 'active' then perform public.raise_org('ORG_VALIDATION'); end if;
    v_payload := private.normalize_request_payload(v_req.company_id, v_req.type, coalesce(p_payload, v_req.payload));
    if v_req.type = 'device_change' then
      perform private.apply_device_change(v_sub.id, v_payload);
    elsif v_req.type = 'termination' then
      perform public.terminate_employee(v_sub.id, v_payload ->> 'reason', v_payload ->> 'note', (v_payload ->> 'last_day')::date);
    else
      perform public.transfer_employee(v_sub.id, (v_payload ->> 'target_position')::uuid, (v_payload ->> 'new_unit')::uuid,
                                       v_payload ->> 'new_title', (v_payload ->> 'new_role')::uuid, (v_payload ->> 'run_at')::date);
    end if;
    v_status := 'approved';
  elsif p_decision = 'reject' then
    if coalesce(length(trim(p_note)), 0) < 2 then perform public.raise_org('ORG_VALIDATION'); end if;
    v_status := 'rejected';
  elsif p_decision = 'postpone' then
    if p_postpone_until is null or p_postpone_until <= public.today_riyadh() then perform public.raise_org('ORG_VALIDATION'); end if;
    v_status := 'postponed';
  else
    perform public.raise_org('ORG_VALIDATION');
  end if;

  update public.requests
     set status = v_status, decided_by = v_me.id, decided_at = now(), decision_note = nullif(trim(p_note), ''),
         postponed_until = case when v_status = 'postponed' then p_postpone_until end,
         payload = coalesce(v_payload, payload)
   where id = p_request;
  insert into public.request_events (request_id, actor_employee_id, action, note, payload)
  values (p_request, v_me.id, p_decision, nullif(trim(p_note), ''), v_payload);

  select user_id into v_requester from public.employees where id = v_req.requester_employee_id;
  perform private.notify(v_requester, v_req.company_id, 'request_decided',
    jsonb_build_object('request_id', p_request, 'type', v_req.type, 'decision', p_decision,
                       'subject_name', v_sub.full_name, 'note', nullif(trim(p_note), ''), 'postponed_until', p_postpone_until));
end
$$;


revoke execute on function private.apply_device_change(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.device_json(uuid) from public, anon, authenticated;
revoke execute on function public.register_device(text, text, text, text) from public, anon;
revoke execute on function public.unbind_device(uuid) from public, anon;
revoke execute on function public.my_device() from public, anon;
revoke execute on function public.employee_device(uuid) from public, anon;
grant execute on function public.register_device(text, text, text, text) to authenticated;
grant execute on function public.unbind_device(uuid) to authenticated;
grant execute on function public.my_device() to authenticated;
grant execute on function public.employee_device(uuid) to authenticated;
