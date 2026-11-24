-- 0021: request lists with display names (names survive termination, which hides employees from branch-scoped RLS).
create or replace function public.request_list(p_mine boolean)
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', q.id, 'type', q.type, 'status', q.status, 'payload', q.payload, 'created_at', q.created_at,
      'decision_note', q.decision_note, 'postponed_until', q.postponed_until, 'decided_at', q.decided_at,
      'subject_id', s.id, 'subject_name', s.full_name, 'requester_name', r.full_name, 'decided_by_name', d.full_name,
      'target_label', (select p.title || ' — ' || u.name from public.positions p join public.org_units u on u.id = p.org_unit_id
                       where p.id = nullif(q.payload ->> 'target_position', '')::uuid),
      'new_unit_name', (select u.name from public.org_units u where u.id = nullif(q.payload ->> 'new_unit', '')::uuid)) as x
    from public.requests q
    join public.employees s on s.id = q.subject_employee_id
    join public.employees r on r.id = q.requester_employee_id
    left join public.employees d on d.id = q.decided_by
    where q.company_id = public.current_company_id()
      and case when p_mine then q.requester_employee_id = (public.current_employee()).id
               else public.has_permission('requests.decide', public.position_unit(s.position_id), s.id) end
    order by q.created_at desc
    limit 200
  ) t
$$;
revoke execute on function public.request_list(boolean) from public, anon;
grant execute on function public.request_list(boolean) to authenticated;
