-- 0002: tenant (company) tables.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  cr_number text not null unique,
  employee_count int not null check (employee_count > 0),
  activity_type text not null check (activity_type in ('commercial', 'service', 'mixed')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies (id) on delete cascade,
  plan_id uuid references public.plans (id),
  status text not null check (status in ('trial', 'active', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.org_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid references public.org_units (id),
  type text not null check (type in ('branch', 'department', 'section', 'team')),
  name text not null,
  catalog_id uuid references public.department_catalog (id),
  is_fixed boolean not null default false,
  manager_position_id uuid,
  created_at timestamptz not null default now()
);
create unique index org_units_one_root on public.org_units (company_id) where parent_id is null;
create index org_units_company_idx on public.org_units (company_id);
create index org_units_parent_idx on public.org_units (parent_id);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  system_key text,
  created_at timestamptz not null default now(),
  unique (company_id, system_key)
);
create index roles_company_idx on public.roles (company_id);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null,
  scope text not null check (scope in ('company', 'branch', 'unit', 'self')),
  primary key (role_id, permission, scope)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  org_unit_id uuid not null references public.org_units (id),
  title text not null,
  role_id uuid not null references public.roles (id),
  is_manager boolean not null default false,
  created_at timestamptz not null default now()
);
create index positions_company_idx on public.positions (company_id);
create index positions_unit_idx on public.positions (org_unit_id);

alter table public.org_units
  add constraint org_units_manager_position_fk foreign key (manager_position_id)
  references public.positions (id) on delete set null deferrable initially deferred;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null unique references auth.users (id),
  position_id uuid unique references public.positions (id),
  full_name text not null,
  birth_date date,
  gender text check (gender in ('male', 'female')),
  nationality char(2),
  identity_type text check (identity_type in ('national_id', 'iqama', 'border_number')),
  identity_number_enc bytea,
  identity_last4 text,
  iqama_expiry date,
  entry_date date,
  phone text not null unique,
  email text unique,
  contract_start date,
  contract_end date,
  status text not null default 'active' check (status in ('active', 'terminated')),
  created_at timestamptz not null default now()
);
create index employees_company_idx on public.employees (company_id);
