-- 0007: single-use invitation links and employee onboarding.

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete cascade,
  token_hash text not null unique,
  sent_to text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index invitations_company_idx on public.invitations (company_id);
create index invitations_position_idx on public.invitations (position_id);
alter table public.invitations enable row level security;
revoke insert, update, delete on public.invitations from anon, authenticated;
revoke select (token_hash) on public.invitations from anon, authenticated;
create policy invitations_select on public.invitations for select to authenticated
  using (company_id = public.current_company_id()
         and public.has_permission('employees.invite', public.position_unit(position_id)));

create or replace function public.hash_token(p_token text)
returns text
language sql immutable
as $$ select encode(digest(p_token, 'sha256'), 'hex') $$;

create or replace function public.create_invitation(p_position uuid, p_sent_to text, p_ttl_days int default 7)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_pos public.positions;
  v_token text;
begin
  select * into v_pos from public.positions where id = p_position;
  if v_pos.id is null or v_pos.company_id is distinct from public.current_company_id()
     or not public.has_permission('employees.invite', v_pos.org_unit_id) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_pos.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if exists (select 1 from public.employees where position_id = p_position and status = 'active') then
    perform public.raise_org('ORG_POSITION_FILLED');
  end if;
  if p_ttl_days is null or p_ttl_days < 1 or p_ttl_days > 30 then perform public.raise_org('ORG_VALIDATION'); end if;

  delete from public.invitations where position_id = p_position and used_at is null;

  v_token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into public.invitations (company_id, position_id, token_hash, sent_to, expires_at, created_by)
  values (v_pos.company_id, p_position, public.hash_token(v_token), p_sent_to,
          now() + make_interval(days => p_ttl_days), auth.uid());
  return v_token;
end
$$;

-- Returns the invitation row after checking it is usable; locks it when p_lock.
create or replace function private.usable_invitation(p_token text, p_lock boolean)
returns public.invitations
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  if p_lock then
    select * into v_inv from public.invitations where token_hash = public.hash_token(p_token) for update;
  else
    select * into v_inv from public.invitations where token_hash = public.hash_token(p_token);
  end if;
  if v_inv.id is null then perform public.raise_org('ORG_INVITE_INVALID'); end if;
  if v_inv.used_at is not null then perform public.raise_org('ORG_INVITE_USED'); end if;
  if v_inv.expires_at <= now() then perform public.raise_org('ORG_INVITE_EXPIRED'); end if;
  return v_inv;
end
$$;

create or replace function public.preview_invitation(p_token text)
returns table (company_name text, unit_name text, position_title text)
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invitations := private.usable_invitation(p_token, false);
begin
  return query
    select c.legal_name, u.name, p.title
    from public.positions p
    join public.org_units u on u.id = p.org_unit_id
    join public.companies c on c.id = p.company_id
    where p.id = v_inv.position_id;
end
$$;

create or replace function public.accept_invitation(
  p_token text, p_full_name text, p_birth_date date, p_gender text, p_nationality text,
  p_identity_type text, p_identity_number text, p_iqama_expiry date, p_entry_date date, p_email text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_phone text;
  v_inv public.invitations;
  v_limit int;
  v_emp uuid;
begin
  if v_user is null then perform public.raise_org('ORG_FORBIDDEN'); end if;
  v_inv := private.usable_invitation(p_token, true);

  select phone into v_phone from auth.users where id = v_user;
  if v_phone is null then perform public.raise_org('ORG_VALIDATION'); end if;
  if exists (select 1 from public.employees where user_id = v_user) then perform public.raise_org('ORG_VALIDATION'); end if;
  if exists (select 1 from public.employees where position_id = v_inv.position_id and status = 'active') then
    perform public.raise_org('ORG_POSITION_FILLED');
  end if;
  if not public.company_is_writable(v_inv.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;

  if coalesce(length(trim(p_full_name)), 0) < 3 or p_gender not in ('male', 'female')
     or p_nationality !~ '^[A-Z]{2}$'
     or (p_nationality = 'SA') <> (p_identity_type = 'national_id')
     or p_birth_date > (current_date - interval '15 years') or p_birth_date < (current_date - interval '80 years') then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  select coalesce(pl.max_employees, 25) into v_limit
  from public.subscriptions s left join public.plans pl on pl.id = s.plan_id
  where s.company_id = v_inv.company_id;
  if (select count(*) from public.employees where company_id = v_inv.company_id and status = 'active') >= coalesce(v_limit, 25) then
    perform public.raise_org('ORG_PLAN_LIMIT');
  end if;

  if exists (select 1 from public.employees where phone = v_phone) then perform public.raise_org('ORG_PHONE_TAKEN'); end if;
  if p_email is not null and exists (select 1 from public.employees where email = lower(p_email)) then
    perform public.raise_org('ORG_EMAIL_TAKEN');
  end if;

  insert into public.employees (company_id, user_id, position_id, full_name, birth_date, gender, nationality, phone, email)
  values (v_inv.company_id, v_user, v_inv.position_id, trim(p_full_name), p_birth_date, p_gender, p_nationality,
          v_phone, lower(p_email))
  returning id into v_emp;

  perform public.set_employee_identity(v_emp, p_identity_type, p_identity_number, p_iqama_expiry, p_entry_date);

  update public.invitations set used_at = now() where id = v_inv.id;
  perform public.write_audit(v_inv.company_id, 'invitation.accept', 'employee', v_emp);
  return v_emp;
end
$$;

revoke execute on function public.create_invitation(uuid, text, int) from public, anon;
grant execute on function public.create_invitation(uuid, text, int) to authenticated;
grant execute on function public.preview_invitation(text) to anon, authenticated;
revoke execute on function public.accept_invitation(text, text, date, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.accept_invitation(text, text, date, text, text, text, text, date, date, text) to authenticated;
