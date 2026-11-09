-- 0001: platform-level tables managed by the platform owner.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_monthly numeric(10, 2) not null check (price_monthly >= 0),
  price_yearly numeric(10, 2) not null check (price_yearly >= 0),
  max_employees int not null check (max_employees > 0),
  modules text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.department_catalog (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  name_en text not null,
  is_fixed boolean not null default false
);

alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.department_catalog enable row level security;

create policy platform_admins_select on public.platform_admins
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

create policy plans_select on public.plans
  for select to authenticated using (is_active or public.is_platform_admin());
create policy plans_insert on public.plans
  for insert to authenticated with check (public.is_platform_admin());
create policy plans_update on public.plans
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy plans_delete on public.plans
  for delete to authenticated using (public.is_platform_admin());

create policy catalog_select on public.department_catalog
  for select to authenticated using (true);
create policy catalog_insert on public.department_catalog
  for insert to authenticated with check (public.is_platform_admin());
create policy catalog_update on public.department_catalog
  for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy catalog_delete on public.department_catalog
  for delete to authenticated using (public.is_platform_admin() and not is_fixed);

insert into public.department_catalog (name_ar, name_en, is_fixed) values
  ('الإدارة العامة', 'General Management', true),
  ('الموارد البشرية', 'Human Resources', true),
  ('المالية', 'Finance', true),
  ('التسويق', 'Marketing', false),
  ('المبيعات', 'Sales', false),
  ('المشتريات', 'Procurement', false),
  ('المخازن واللوجستيات', 'Warehouse & Logistics', false),
  ('خدمة العملاء', 'Customer Service', false),
  ('العمليات', 'Operations', false),
  ('تقنية المعلومات', 'IT', false),
  ('الجودة', 'Quality', false),
  ('الشؤون القانونية', 'Legal', false);
