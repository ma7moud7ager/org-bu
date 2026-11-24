-- 0024: work-location geofences on units and basic check-in/check-out from the app.

alter table public.org_units
  add column geo_lat double precision,
  add column geo_lng double precision,
  add column geo_radius_m int not null default 100 check (geo_radius_m between 20 and 2000);

-- Same formula as haversineMeters in packages/shared/src/geo.ts.
create or replace function private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable set search_path = public
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

-- Nearest unit on the employee's path (deepest first) that has a location.
create or replace function private.employee_geofence(p_employee uuid)
returns table (unit_id uuid, lat double precision, lng double precision, radius int)
language sql stable security definer set search_path = public, extensions
as $$
  select u.id, u.geo_lat, u.geo_lng, u.geo_radius_m
  from public.employees e
  cross join lateral unnest(public.unit_path(public.position_unit(e.position_id))) with ordinality as p(id, depth)
  join public.org_units u on u.id = p.id
  where e.id = p_employee and u.geo_lat is not null and u.geo_lng is not null
  order by p.depth desc
  limit 1
$$;

create or replace function public.set_unit_location(p_unit uuid, p_lat double precision, p_lng double precision, p_radius int)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_unit public.org_units;
begin
  select * into v_unit from public.org_units where id = p_unit;
  if v_unit.id is null or v_unit.company_id is distinct from public.current_company_id()
     or not public.has_permission('structure.manage', p_unit) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_unit.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (abs(p_lat) > 90 or abs(p_lng) > 180))
     or coalesce(p_radius, 100) not between 20 and 2000 then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  update public.org_units set geo_lat = p_lat, geo_lng = p_lng, geo_radius_m = coalesce(p_radius, 100) where id = p_unit;
  perform public.write_audit(v_unit.company_id, 'unit.location', 'org_unit', p_unit,
    jsonb_build_object('lat', v_unit.geo_lat, 'lng', v_unit.geo_lng, 'radius', v_unit.geo_radius_m),
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'radius', coalesce(p_radius, 100)));
end
$$;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id),
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  distance_m double precision,
  unit_id uuid references public.org_units (id) on delete set null,
  device_id text,
  result text not null check (result in ('accepted', 'rejected')),
  reason text check (reason in ('device', 'biometric', 'mock', 'accuracy', 'no_location', 'outside', 'sequence'))
);
create index attendance_records_employee_idx on public.attendance_records (employee_id, at desc);
create index attendance_records_company_idx on public.attendance_records (company_id, at desc);
create index attendance_records_unit_idx on public.attendance_records (unit_id);
alter table public.attendance_records enable row level security;
revoke insert, update, delete on public.attendance_records from anon, authenticated;
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (company_id = public.current_company_id()
         and exists (select 1 from public.employees e where e.id = employee_id
                     and (e.id = (public.current_employee()).id
                          or public.has_permission('employees.view', public.position_unit(e.position_id), e.id))));

create or replace function public.record_attendance(p_kind text, p_lat double precision, p_lng double precision,
                                                    p_accuracy double precision, p_is_mock boolean, p_biometric_ok boolean,
                                                    p_device_id text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_fence record;
  v_dist double precision;
  v_reason text;
  v_last public.attendance_records;
  v_mgr uuid;
  v_at timestamptz := now();
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if p_kind is null or p_kind not in ('in', 'out') then perform public.raise_org('ORG_VALIDATION'); end if;

  select * into v_fence from private.employee_geofence(v_me.id);
  if v_fence.unit_id is not null and p_lat is not null and p_lng is not null then
    v_dist := private.distance_m(v_fence.lat, v_fence.lng, p_lat, p_lng);
  end if;
  -- An "in" must follow nothing or an "out"; an "out" must follow an "in" from the last 20 hours (night shifts).
  select * into v_last from public.attendance_records
   where employee_id = v_me.id and result = 'accepted' order by at desc limit 1;

  v_reason := case
    when not exists (select 1 from public.employee_devices where employee_id = v_me.id and status = 'active'
                     and device_id = p_device_id) then 'device'
    when p_biometric_ok is not true then 'biometric'
    when p_is_mock is not false then 'mock'
    when p_lat is null or p_lng is null or p_accuracy is null or p_accuracy > 100 then 'accuracy'
    when v_fence.unit_id is null then 'no_location'
    when v_dist > v_fence.radius then 'outside'
    when p_kind = 'in' and v_last.kind = 'in' and v_last.at > v_at - interval '20 hours' then 'sequence'
    when p_kind = 'out' and (v_last.id is null or v_last.kind <> 'in' or v_last.at <= v_at - interval '20 hours') then 'sequence'
  end;

  insert into public.attendance_records (company_id, employee_id, kind, at, lat, lng, accuracy_m, distance_m, unit_id,
                                         device_id, result, reason)
  values (v_me.company_id, v_me.id, p_kind, v_at, p_lat, p_lng, p_accuracy, round(v_dist::numeric, 1), v_fence.unit_id,
          p_device_id, case when v_reason is null then 'accepted' else 'rejected' end, v_reason);

  if v_reason is not null then
    perform private.notify(v_me.user_id, v_me.company_id, 'attendance_rejected',
      jsonb_build_object('kind', p_kind, 'reason', v_reason, 'employee_id', v_me.id, 'employee_name', v_me.full_name));
    v_mgr := public.direct_manager(v_me.id);
    if v_mgr is not null then
      perform private.notify((select user_id from public.employees where id = v_mgr), v_me.company_id, 'attendance_rejected',
        jsonb_build_object('kind', p_kind, 'reason', v_reason, 'employee_id', v_me.id, 'employee_name', v_me.full_name));
    end if;
  end if;

  return jsonb_build_object('result', case when v_reason is null then 'accepted' else 'rejected' end,
                            'reason', v_reason, 'distance_m', round(v_dist::numeric, 1), 'at', v_at);
end
$$;

create or replace function public.my_attendance_today()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_last public.attendance_records;
  v_fence record;
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  select * into v_last from public.attendance_records
   where employee_id = v_me.id and result = 'accepted' order by at desc limit 1;
  select * into v_fence from private.employee_geofence(v_me.id);
  return jsonb_build_object(
    'next_kind', case when v_last.kind = 'in' and v_last.at > now() - interval '20 hours' then 'out' else 'in' end,
    'fence_configured', v_fence.unit_id is not null,
    'fence_unit', (select name from public.org_units where id = v_fence.unit_id),
    'records', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'at', r.at, 'result', r.result, 'reason', r.reason,
                                                             'distance_m', r.distance_m) order by r.at)
                         from public.attendance_records r
                         where r.employee_id = v_me.id and (r.at at time zone 'Asia/Riyadh')::date = public.today_riyadh()), '[]'::jsonb));
end
$$;

-- One row per visible active employee for a Riyadh calendar day (optionally inside a unit subtree).
create or replace function public.attendance_day(p_date date, p_unit uuid default null)
returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(row order by row ->> 'employee_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'employee_id', e.id, 'employee_name', e.full_name, 'unit_name', u.name,
      'first_in', (select min(r.at) from public.attendance_records r where r.employee_id = e.id and r.result = 'accepted'
                   and r.kind = 'in' and (r.at at time zone 'Asia/Riyadh')::date = p_date),
      'last_out', (select max(r.at) from public.attendance_records r where r.employee_id = e.id and r.result = 'accepted'
                   and r.kind = 'out' and (r.at at time zone 'Asia/Riyadh')::date = p_date),
      'records', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'at', r.at) order by r.at)
                           from public.attendance_records r where r.employee_id = e.id and r.result = 'accepted'
                           and (r.at at time zone 'Asia/Riyadh')::date = p_date), '[]'::jsonb),
      'rejected', coalesce((select jsonb_agg(jsonb_build_object('kind', r.kind, 'at', r.at, 'reason', r.reason) order by r.at)
                            from public.attendance_records r where r.employee_id = e.id and r.result = 'rejected'
                            and (r.at at time zone 'Asia/Riyadh')::date = p_date), '[]'::jsonb)) as row
    from public.employees e
    join public.positions p on p.id = e.position_id
    join public.org_units u on u.id = p.org_unit_id
    where e.company_id = public.current_company_id() and e.status = 'active'
      and public.has_permission('employees.view', p.org_unit_id, e.id)
      and (p_unit is null or p_unit = any (public.unit_path(p.org_unit_id)))
  ) t
$$;

revoke execute on function private.distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function private.employee_geofence(uuid) from public, anon, authenticated;
revoke execute on function public.set_unit_location(uuid, double precision, double precision, int) from public, anon;
revoke execute on function public.record_attendance(text, double precision, double precision, double precision, boolean, boolean, text) from public, anon;
revoke execute on function public.my_attendance_today() from public, anon;
revoke execute on function public.attendance_day(date, uuid) from public, anon;
grant execute on function public.set_unit_location(uuid, double precision, double precision, int) to authenticated;
grant execute on function public.record_attendance(text, double precision, double precision, double precision, boolean, boolean, text) to authenticated;
grant execute on function public.my_attendance_today() to authenticated;
grant execute on function public.attendance_day(date, uuid) to authenticated;
