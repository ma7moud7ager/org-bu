import { loadActor, toOrgUnit, type UnitRow } from '@/lib/actor';
import { createServerSupabase } from '@/lib/supabase/server';
import { buildTree } from '@/lib/tree';
import { OrgTree, type RoleRow } from '@/components/org-tree';
import type { PositionRef } from '@orgbu/shared';

type PositionRow = { id: string; org_unit_id: string; is_manager: boolean; title: string; role_id: string; show_phone_to_reports: boolean; employees: { id: string; full_name: string } | null };

export default async function StructurePage() {
  const bundle = (await loadActor())!;
  const supabase = await createServerSupabase();
  const [units, positions, roles] = await Promise.all([
    supabase.from('org_units').select('id, parent_id, type, name, is_fixed, manager_position_id'),
    supabase.from('positions').select('id, org_unit_id, is_manager, title, role_id, show_phone_to_reports, employees(id, full_name)'),
    supabase.from('roles').select('id, name, system_key, role_permissions(permission)'),
  ]);
  const posRows = (positions.data ?? []) as unknown as PositionRow[];
  const refs: PositionRef[] = posRows.map((p) => ({ id: p.id, unitId: p.org_unit_id, isManager: p.is_manager, employeeId: p.employees?.id ?? null }));
  const tree = buildTree(((units.data ?? []) as UnitRow[]).map(toOrgUnit), refs);
  const details = Object.fromEntries(posRows.map((p) => [p.id, { title: p.title, employeeName: p.employees?.full_name ?? null, roleId: p.role_id, showPhone: p.show_phone_to_reports }]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الهيكل التنظيمي</h1>
      <OrgTree tree={tree} bundle={bundle} positionDetails={details} roles={(roles.data ?? []) as unknown as RoleRow[]} />
    </div>
  );
}
