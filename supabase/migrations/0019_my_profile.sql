-- 0019: direct manager resolution (mirrors resolveDirectManager in packages/shared/src/org-tree.ts) and "بياناتي".

create or replace function public.direct_manager(p_employee uuid)
returns uuid
language sql stable security definer set search_path = public, extensions
as $$
  with me as (
    select e.id, e.position_id, e.company_id from public.employees e
    where e.id = p_employee and e.company_id = public.current_company_id() and e.position_id is not null
  ),
  path as (
    select u.id, u.ordinality as depth
    from me, unnest(public.unit_path(public.position_unit(me.position_id))) with ordinality as u(id, ordinality)
  )
  select m.id
  from path
  join public.org_units ou on ou.id = path.id
  join me on true
  join public.employees m on m.position_id = ou.manager_position_id and m.status = 'active'
  where ou.manager_position_id is not null and ou.manager_position_id <> me.position_id
  order by path.depth desc
  limit 1
$$;

create or replace function public.my_profile()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_mgr uuid;
  v_job jsonb;
  v_manager jsonb;
  v_requests jsonb;
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;

  select jsonb_build_object('position_id', p.id, 'title', p.title, 'unit_name', u.name, 'role_name', r.name,
                            'branch_name', (select b.name from public.org_units b where b.id = public.unit_branch(u.id)),
                            'show_phone_to_reports', p.show_phone_to_reports)
    into v_job
  from public.positions p join public.org_units u on u.id = p.org_unit_id join public.roles r on r.id = p.role_id
  where p.id = v_me.position_id;

  v_mgr := public.direct_manager(v_me.id);
  if v_mgr is not null then
    select jsonb_build_object('employee_id', m.id, 'name', m.full_name, 'title', p.title)
           || case when p.show_phone_to_reports then jsonb_build_object('phone', m.phone) else '{}'::jsonb end
      into v_manager
    from public.employees m join public.positions p on p.id = m.position_id
    where m.id = v_mgr;
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) into v_requests
  from (
    select jsonb_build_object('id', q.id, 'type', q.type, 'status', q.status, 'subject_name', s.full_name,
                              'created_at', q.created_at, 'decision_note', q.decision_note,
                              'postponed_until', q.postponed_until) as x
    from public.requests q join public.employees s on s.id = q.subject_employee_id
    where q.requester_employee_id = v_me.id
    order by q.created_at desc
    limit 20
  ) t;

  return jsonb_build_object(
    'me', jsonb_build_object('id', v_me.id, 'full_name', v_me.full_name, 'phone', v_me.phone, 'email', v_me.email,
                             'birth_date', v_me.birth_date, 'gender', v_me.gender, 'nationality', v_me.nationality,
                             'identity_type', v_me.identity_type, 'identity_last4', v_me.identity_last4,
                             'iqama_expiry', v_me.iqama_expiry, 'entry_date', v_me.entry_date,
                             'contract_start', v_me.contract_start, 'contract_end', v_me.contract_end),
    'company', jsonb_build_object('name', (select legal_name from public.companies where id = v_me.company_id)),
    'job', v_job,
    'manager', v_manager,
    'requests', v_requests);
end
$$;

revoke execute on function public.direct_manager(uuid) from public, anon;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.direct_manager(uuid) to authenticated;
grant execute on function public.my_profile() to authenticated;
