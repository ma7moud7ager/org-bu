-- 0011: Supabase Auth stores phones as digits without '+'. Compare without '+', store employees.phone as +E.164.
create or replace function public.employees_phone_guard()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_phone text;
begin
  select ltrim(phone, '+') into v_phone from auth.users where id = new.user_id;
  if v_phone is null or v_phone = '' or v_phone is distinct from ltrim(new.phone, '+') then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  new.phone := '+' || v_phone;
  return new;
end
$$;
