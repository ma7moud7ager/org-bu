-- 0005: org unit integrity rules (cycles, cross-company parents, root) and safe create/delete RPCs.

create or replace function public.org_units_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.parent_id is null and new.parent_id is not null then
    perform public.raise_org('ORG_UNIT_FIXED');
  end if;
  if tg_op = 'UPDATE' and old.parent_id is not null and new.parent_id is null then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if new.parent_id is not null then
    if not exists (select 1 from public.org_units where id = new.parent_id and company_id = new.company_id) then
      perform public.raise_org('ORG_VALIDATION');
    end if;
    if tg_op = 'UPDATE' and (new.parent_id = new.id or new.id = any (public.unit_path(new.parent_id))) then
      perform public.raise_org('ORG_UNIT_CYCLE');
    end if;
  end if;
  return new;
end
$$;

create trigger org_units_guard
  before insert or update of parent_id, company_id on public.org_units
  for each row execute function public.org_units_guard();

create or replace function public.create_org_unit(p_parent uuid, p_type text, p_name text, p_catalog_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
  v_id uuid;
begin
  select company_id into v_company from public.org_units where id = p_parent;
  if v_company is null or v_company is distinct from public.current_company_id()
     or not public.has_permission('structure.manage', p_parent) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_company) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if p_type not in ('branch', 'department', 'section', 'team') or coalesce(length(trim(p_name)), 0) < 2 then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  insert into public.org_units (company_id, parent_id, type, name, catalog_id)
  values (v_company, p_parent, p_type, trim(p_name), p_catalog_id)
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.delete_org_unit(p_unit uuid, p_replacement uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_unit public.org_units;
  v_has_content boolean;
begin
  select * into v_unit from public.org_units where id = p_unit for update;
  if v_unit.id is null or v_unit.company_id is distinct from public.current_company_id()
     or not public.has_permission('structure.manage', p_unit) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  if not public.company_is_writable(v_unit.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_unit.parent_id is null then perform public.raise_org('ORG_UNIT_FIXED'); end if;

  v_has_content := exists (select 1 from public.org_units where parent_id = p_unit)
                or exists (select 1 from public.positions where org_unit_id = p_unit);

  if not v_has_content then
    if v_unit.is_fixed then perform public.raise_org('ORG_UNIT_FIXED'); end if;
  else
    if p_replacement is null then perform public.raise_org('ORG_UNIT_NOT_EMPTY'); end if;
    if p_replacement = p_unit
       or not exists (select 1 from public.org_units where id = p_replacement and company_id = v_unit.company_id)
       or p_unit = any (public.unit_path(p_replacement)) then
      perform public.raise_org('ORG_VALIDATION');
    end if;
    if not public.has_permission('structure.manage', p_replacement) then perform public.raise_org('ORG_FORBIDDEN'); end if;
    update public.org_units set parent_id = p_replacement where parent_id = p_unit;
    update public.positions set org_unit_id = p_replacement where org_unit_id = p_unit;
    -- A moved manager position must not stay the manager of the deleted unit.
    update public.positions set is_manager = false
      where id = v_unit.manager_position_id
        and id is distinct from (select manager_position_id from public.org_units where id = p_replacement);
  end if;

  delete from public.org_units where id = p_unit;
end
$$;

revoke delete on public.org_units from authenticated, anon;
revoke execute on function public.create_org_unit(uuid, text, text, uuid) from anon, public;
revoke execute on function public.delete_org_unit(uuid, uuid) from anon, public;
grant execute on function public.create_org_unit(uuid, text, text, uuid) to authenticated;
grant execute on function public.delete_org_unit(uuid, uuid) to authenticated;
