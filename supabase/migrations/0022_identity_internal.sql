-- 0022 (final review): set_employee_identity becomes internal. Self-updates go through update_employee_document /
-- update_my_document (which enforce the self rules and notify HR); accept_invitation still calls it as owner.
revoke execute on function public.set_employee_identity(uuid, text, text, date, date) from authenticated;

-- Self may set a first document, renew an iqama, or convert a border number to an iqama.
create or replace function public.update_employee_document(p_employee uuid, p_identity_type text, p_number text,
                                                           p_iqama_expiry date, p_entry_date date)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_me public.employees := public.current_employee();
  v_emp public.employees;
  v_self boolean;
  v_hr boolean;
  h record;
begin
  select * into v_emp from public.employees where id = p_employee;
  if v_me.id is null or v_emp.id is null or v_emp.company_id <> v_me.company_id then perform public.raise_org('ORG_FORBIDDEN'); end if;
  v_self := v_emp.id = v_me.id;
  v_hr := public.has_permission('employees.edit', public.position_unit(v_emp.position_id), v_emp.id);
  if not v_self and not v_hr then perform public.raise_org('ORG_FORBIDDEN'); end if;
  if not public.company_is_writable(v_emp.company_id) then perform public.raise_org('ORG_SUBSCRIPTION_INACTIVE'); end if;
  if v_self and not v_hr and v_emp.identity_type is not null
     and (p_identity_type is distinct from 'iqama' or v_emp.identity_type not in ('iqama', 'border_number')) then
    perform public.raise_org('ORG_VALIDATION');
  end if;
  if v_emp.nationality is not null and (v_emp.nationality = 'SA') <> (p_identity_type = 'national_id') then
    perform public.raise_org('ORG_VALIDATION');
  end if;

  perform public.set_employee_identity(p_employee, p_identity_type, p_number, p_iqama_expiry, p_entry_date);

  if v_self then
    for h in select * from private.permission_holders(v_emp.company_id, 'employees.view_sensitive',
                                                       public.position_unit(v_emp.position_id)) loop
      if h.employee_id <> v_emp.id then
        perform private.notify(h.user_id, v_emp.company_id, 'document_updated',
          jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name,
                             'identity_type', p_identity_type, 'iqama_expiry', p_iqama_expiry));
      end if;
    end loop;
  end if;
end
$$;
