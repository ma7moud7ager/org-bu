-- 0008: announcements (news/decisions) with audience targeting, and user notifications.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('news', 'decision')),
  title text not null,
  body text not null,
  audience_unit_ids uuid[], -- null = whole company
  pinned boolean not null default false,
  published_by uuid not null references public.employees (id),
  published_at timestamptz not null default now()
);
create index announcements_company_idx on public.announcements (company_id, published_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.notifications enable row level security;
revoke insert, update, delete on public.announcements, public.announcement_reads from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.current_unit_path()
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select public.unit_path(public.position_unit((public.current_employee()).position_id))
$$;

create policy announcements_select on public.announcements for select to authenticated
  using (company_id = public.current_company_id()
         and (audience_unit_ids is null or audience_unit_ids && public.current_unit_path()));
create policy announcement_reads_select on public.announcement_reads for select to authenticated
  using (employee_id = (public.current_employee()).id);
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.publish_announcement(p_kind text, p_title text, p_body text, p_audience uuid[],
                                                       p_pinned boolean default false)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.employees := public.current_employee();
  v_unit uuid;
  v_id uuid;
begin
  if v_me.id is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if not public.company_is_writable(v_me.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if p_kind not in ('news', 'decision') or coalesce(length(trim(p_title)), 0) < 2 or coalesce(length(trim(p_body)), 0) < 1 then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  if p_audience is null or cardinality(p_audience) = 0 then
    -- Whole company requires company scope: check against the root with a 'company' grant only.
    if not exists (
      select 1 from public.positions p join public.role_permissions rp on rp.role_id = p.role_id
      where p.id = v_me.position_id and rp.permission = 'announcements.publish' and rp.scope = 'company'
    ) then
      perform public.raise_org('ORG_FORBIDDEN');
    end if;
    p_audience := null;
  else
    foreach v_unit in array p_audience loop
      if not public.has_permission('announcements.publish', v_unit) then perform public.raise_org('ORG_FORBIDDEN'); end if;
    end loop;
  end if;

  insert into public.announcements (company_id, kind, title, body, audience_unit_ids, pinned, published_by)
  values (v_me.company_id, p_kind, trim(p_title), p_body, p_audience, coalesce(p_pinned, false), v_me.id)
  returning id into v_id;

  insert into public.notifications (user_id, company_id, type, payload)
  select e.user_id, e.company_id, 'announcement',
         jsonb_build_object('announcement_id', v_id, 'kind', p_kind, 'title', trim(p_title))
  from public.employees e
  where e.company_id = v_me.company_id and e.status = 'active'
    and (p_audience is null or public.unit_path(public.position_unit(e.position_id)) && p_audience);

  return v_id;
end
$$;

create or replace function public.mark_announcement_read(p_announcement uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.employees := public.current_employee();
begin
  if v_me.id is null or not exists (
    select 1 from public.announcements a where a.id = p_announcement and a.company_id = v_me.company_id
      and (a.audience_unit_ids is null or a.audience_unit_ids && public.current_unit_path())
  ) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  insert into public.announcement_reads (announcement_id, employee_id) values (p_announcement, v_me.id)
  on conflict do nothing;
end
$$;

revoke execute on function public.publish_announcement(text, text, text, uuid[], boolean) from public, anon;
revoke execute on function public.mark_announcement_read(uuid) from public, anon;
grant execute on function public.publish_announcement(text, text, text, uuid[], boolean) to authenticated;
grant execute on function public.mark_announcement_read(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
