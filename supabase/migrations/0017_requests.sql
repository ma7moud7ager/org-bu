-- 0017: generic requests engine (now: termination, transfer). Requests route to holders of requests.decide.

-- Validates and normalizes a request payload; raises ORG_VALIDATION / ORG_FORBIDDEN / ORG_POSITION_FILLED.
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

create or replace function public.submit_request(p_type text, p_subject uuid, p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_sub public.employees;
  v_payload jsonb;
  v_id uuid;
  h record;
begin
  if p_type is null or p_type not in ('termination', 'transfer') then perform public.raise_org('ORG_VALIDATION'); end if;
  select * into v_sub from public.employees where id = p_subject;
  if v_me.id is null or v_sub.id is null or v_sub.company_id <> v_me.company_id
     or not public.has_permission(case p_type when 'termination' then 'employees.request_terminate'
                                              else 'employees.request_transfer' end,
                                  public.position_unit(v_sub.position_id), v_sub.id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_me.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_sub.status <> 'active' or v_sub.id = v_me.id then perform public.raise_org('ORG_VALIDATION'); end if;
  if exists (select 1 from public.requests where subject_employee_id = p_subject and type = p_type
             and status in ('pending', 'postponed')) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  v_payload := private.normalize_request_payload(v_me.company_id, p_type, coalesce(p_payload, '{}'));

  insert into public.requests (company_id, type, requester_employee_id, subject_employee_id, payload)
  values (v_me.company_id, p_type, v_me.id, p_subject, v_payload)
  returning id into v_id;
  insert into public.request_events (request_id, actor_employee_id, action, payload) values (v_id, v_me.id, 'submitted', v_payload);

  for h in select * from private.permission_holders(v_me.company_id, 'requests.decide', public.position_unit(v_sub.position_id))
  loop
    perform private.notify(h.user_id, v_me.company_id, 'request_new',
      jsonb_build_object('request_id', v_id, 'type', p_type, 'subject_name', v_sub.full_name, 'requester_name', v_me.full_name));
  end loop;
  return v_id;
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
    if v_req.type = 'termination' then
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

create or replace function public.cancel_request(p_request uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_req public.requests;
begin
  select * into v_req from public.requests where id = p_request for update;
  if v_me.id is null or v_req.id is null or v_req.requester_employee_id <> v_me.id then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if v_req.status not in ('pending', 'postponed') then perform public.raise_org('ORG_VALIDATION'); end if;
  update public.requests set status = 'cancelled' where id = p_request;
  insert into public.request_events (request_id, actor_employee_id, action) values (p_request, v_me.id, 'cancelled');
end
$$;

revoke execute on function private.normalize_request_payload(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_request(text, uuid, jsonb) from public, anon;
revoke execute on function public.decide_request(uuid, text, text, jsonb, date) from public, anon;
revoke execute on function public.cancel_request(uuid) from public, anon;
grant execute on function public.submit_request(text, uuid, jsonb) to authenticated;
grant execute on function public.decide_request(uuid, text, text, jsonb, date) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
