import 'server-only';
import { cache } from 'react';
import { branchOf, unitPath, type Grant, type OrgUnit } from '@orgbu/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ActorBundle } from './actor-types';

export type UnitRow = { id: string; parent_id: string | null; type: OrgUnit['type']; name: string; is_fixed: boolean; manager_position_id: string | null };

export const toOrgUnit = (u: UnitRow): OrgUnit => ({
  id: u.id,
  parentId: u.parent_id,
  type: u.type,
  name: u.name,
  isFixed: u.is_fixed,
  managerPositionId: u.manager_position_id,
});

export const loadActor = cache(async (): Promise<ActorBundle | null> => {
  const supabase = await createServerSupabase();
  const { data: emp } = await supabase.rpc('current_employee');
  const e = emp as { id: string; full_name: string; company_id: string; position_id: string } | null;
  if (!e?.id) return null;

  const [pos, units, company, writable] = await Promise.all([
    supabase.from('positions').select('org_unit_id, role_id, role_permissions:roles(role_permissions(permission, scope))').eq('id', e.position_id).single(),
    supabase.from('org_units').select('id, parent_id, type, name, is_fixed, manager_position_id'),
    supabase.from('companies').select('legal_name').eq('id', e.company_id).single(),
    supabase.rpc('company_is_writable', { p_company: e.company_id }),
  ]);

  const p = pos.data as { org_unit_id: string; role_permissions: { role_permissions: Grant[] } | null } | null;
  const orgUnits = ((units.data ?? []) as UnitRow[]).map(toOrgUnit);
  const unitId = p?.org_unit_id ?? '';
  return {
    employee: { id: e.id, fullName: e.full_name, companyId: e.company_id, positionId: e.position_id },
    actor: { employeeId: e.id, unitPath: unitId ? unitPath(orgUnits, unitId) : [], branchId: unitId ? branchOf(orgUnits, unitId) : null },
    grants: p?.role_permissions?.role_permissions ?? [],
    companyName: (company.data as { legal_name: string } | null)?.legal_name ?? '',
    writable: writable.data === true,
  };
});
