-- 0014: Phase 2a schema — termination fields, position phone flag, requests engine, scheduled actions,
-- new permissions (+ backfill for existing companies), and the Riyadh calendar date.

create or replace function public.today_riyadh()
returns date
language sql stable set search_path = public
as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

alter table public.employees
  add column termination_reason text
    check (termination_reason in ('resignation', 'dismissal', 'contract_end', 'probation', 'other')),
  add column termination_note text,
  add column last_working_day date,
  add column terminated_at timestamptz,
  add column terminated_by uuid;
grant select (termination_reason, termination_note, last_working_day, terminated_at) on public.employees to authenticated;

alter table public.positions add column show_phone_to_reports boolean not null default false;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null check (type in ('termination', 'transfer')),
  requester_employee_id uuid not null references public.employees (id),
  subject_employee_id uuid not null references public.employees (id),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'postponed', 'cancelled')),
  decided_by uuid references public.employees (id),
  decided_at timestamptz,
  decision_note text,
  postponed_until date,
  created_at timestamptz not null default now()
);
create index requests_company_idx on public.requests (company_id, status, created_at desc);
create index requests_requester_idx on public.requests (requester_employee_id);
create index requests_subject_idx on public.requests (subject_employee_id);
create index requests_decided_by_idx on public.requests (decided_by);

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  actor_employee_id uuid references public.employees (id),
  action text not null,
  note text,
  payload jsonb,
  at timestamptz not null default now()
);
create index request_events_request_idx on public.request_events (request_id);
create index request_events_actor_idx on public.request_events (actor_employee_id);

create table public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('termination', 'transfer')),
  employee_id uuid not null references public.employees (id),
  payload jsonb not null default '{}',
  run_at date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled', 'failed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  error text
);
create index scheduled_actions_due_idx on public.scheduled_actions (run_at) where status = 'scheduled';
create index scheduled_actions_company_idx on public.scheduled_actions (company_id);
create index scheduled_actions_employee_idx on public.scheduled_actions (employee_id);
-- At most one pending action of each kind per employee.
create unique index scheduled_actions_one_pending on public.scheduled_actions (employee_id, kind) where status = 'scheduled';

alter table public.requests enable row level security;
alter table public.request_events enable row level security;
alter table public.scheduled_actions enable row level security;
revoke insert, update, delete on public.requests, public.request_events, public.scheduled_actions from anon, authenticated;

create policy requests_select on public.requests for select to authenticated
  using (company_id = public.current_company_id()
         and (requester_employee_id = (public.current_employee()).id
              or public.has_permission('requests.decide', public.company_root(company_id))));
create policy request_events_select on public.request_events for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id));
create policy scheduled_actions_select on public.scheduled_actions for select to authenticated
  using (company_id = public.current_company_id()
         and (public.has_permission('employees.terminate', public.company_root(company_id))
              or public.has_permission('employees.transfer', public.company_root(company_id))));

-- Mirrors DEFAULT_ROLE_GRANTS in packages/shared/src/permissions.ts (a test asserts equality).
create or replace function public.default_role_grants()
returns table (system_key text, permission text, scope text)
language sql immutable set search_path = public
as $$
  select * from (values
    ('company_admin', 'structure.manage', 'company'),
    ('company_admin', 'roles.manage', 'company'),
    ('company_admin', 'employees.invite', 'company'),
    ('company_admin', 'employees.view', 'company'),
    ('company_admin', 'employees.edit', 'company'),
    ('company_admin', 'employees.terminate', 'company'),
    ('company_admin', 'employees.view_sensitive', 'company'),
    ('company_admin', 'announcements.publish', 'company'),
    ('company_admin', 'subscription.view', 'company'),
    ('company_admin', 'employees.transfer', 'company'),
    ('company_admin', 'requests.decide', 'company'),
    ('hr', 'employees.invite', 'company'),
    ('hr', 'employees.view', 'company'),
    ('hr', 'employees.edit', 'company'),
    ('hr', 'employees.terminate', 'company'),
    ('hr', 'employees.view_sensitive', 'company'),
    ('hr', 'announcements.publish', 'company'),
    ('hr', 'structure.manage', 'company'),
    ('hr', 'employees.transfer', 'company'),
    ('hr', 'requests.decide', 'company'),
    ('finance', 'employees.view', 'company'),
    ('branch_manager', 'employees.invite', 'branch'),
    ('branch_manager', 'employees.view', 'branch'),
    ('branch_manager', 'employees.edit', 'branch'),
    ('branch_manager', 'announcements.publish', 'branch'),
    ('branch_manager', 'employees.request_terminate', 'branch'),
    ('branch_manager', 'employees.request_transfer', 'branch'),
    ('unit_manager', 'employees.view', 'unit'),
    ('unit_manager', 'announcements.publish', 'unit'),
    ('employee', 'employees.view', 'self')
  ) as g (system_key, permission, scope)
$$;

create schema if not exists private;
-- Adds the phase 2a grants to existing system roles (idempotent; never touches custom roles or other permissions).
create or replace function private.backfill_role_grants()
returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.role_permissions (role_id, permission, scope)
  select r.id, g.permission, g.scope
  from public.roles r
  join public.default_role_grants() g on g.system_key = r.system_key
  where g.permission in ('employees.transfer', 'requests.decide', 'employees.request_terminate', 'employees.request_transfer')
  on conflict do nothing
$$;
revoke execute on function private.backfill_role_grants() from public, anon, authenticated;
select private.backfill_role_grants();

revoke execute on function public.today_riyadh() from anon;
