-- 0010: final-review fixes.
-- (1) Only holders of roles.manage may assign a role that itself grants roles.manage (blocks HR minting admins),
--     and roles must belong to the same company.
-- (2) An employee's phone must equal the verified phone of their auth user.

create or replace function public.can_assign_role(p_role uuid)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from public.roles r where r.id = p_role and r.company_id = public.current_company_id())
     and (
       not exists (select 1 from public.role_permissions rp where rp.role_id = p_role and rp.permission = 'roles.manage')
       or public.has_permission('roles.manage', public.company_root(public.current_company_id()))
     )
$$;
revoke execute on function public.can_assign_role(uuid) from public, anon;

drop policy positions_insert on public.positions;
drop policy positions_update on public.positions;
create policy positions_insert on public.positions for insert to authenticated
  with check (company_id = public.current_company_id() and public.company_is_writable(company_id)
              and public.has_permission('structure.manage', org_unit_id) and public.can_assign_role(role_id));
create policy positions_update on public.positions for update to authenticated
  using (company_id = public.current_company_id() and public.company_is_writable(company_id)
         and public.has_permission('structure.manage', org_unit_id) and public.can_assign_role(role_id))
  with check (company_id = public.current_company_id() and public.has_permission('structure.manage', org_unit_id)
              and public.can_assign_role(role_id));

create or replace function public.invitations_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.can_assign_role((select role_id from public.positions where id = new.position_id)) then
    perform public.raise_org('ORG_FORBIDDEN');
  end if;
  return new;
end
$$;
revoke execute on function public.invitations_guard() from public, anon, authenticated;
create trigger invitations_guard before insert on public.invitations
  for each row execute function public.invitations_guard();

create or replace function public.employees_phone_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_phone text;
begin
  select phone into v_phone from auth.users where id = new.user_id;
  if v_phone is null or v_phone is distinct from new.phone then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  return new;
end
$$;
revoke execute on function public.employees_phone_guard() from public, anon, authenticated;
create trigger employees_phone_guard before insert or update of phone, user_id on public.employees
  for each row execute function public.employees_phone_guard();
