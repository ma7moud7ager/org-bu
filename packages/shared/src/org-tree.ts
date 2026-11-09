export type UnitType = 'branch' | 'department' | 'section' | 'team';
export type ActivityType = 'commercial' | 'service' | 'mixed';

export type OrgUnit = {
  id: string;
  parentId: string | null;
  type: UnitType;
  name: string;
  isFixed: boolean;
  managerPositionId: string | null;
};
export type PositionRef = { id: string; unitId: string; isManager: boolean; employeeId: string | null };

function indexUnits(units: OrgUnit[]): Map<string, OrgUnit> {
  return new Map(units.map((u) => [u.id, u]));
}

export function unitPath(units: OrgUnit[], unitId: string): string[] {
  const byId = indexUnits(units);
  const path: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(unitId);
  while (cur) {
    if (seen.has(cur.id)) throw new Error('ORG_UNIT_CYCLE');
    seen.add(cur.id);
    path.unshift(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export function branchOf(units: OrgUnit[], unitId: string): string | null {
  const byId = indexUnits(units);
  const path = unitPath(units, unitId);
  for (let i = path.length - 1; i >= 0; i--) {
    if (byId.get(path[i]!)?.type === 'branch') return path[i]!;
  }
  return null;
}

export function resolveDirectManager(units: OrgUnit[], positions: PositionRef[], employeePositionId: string): string | null {
  const byId = indexUnits(units);
  const posById = new Map(positions.map((p) => [p.id, p]));
  const own = posById.get(employeePositionId);
  if (!own) return null;
  const path = unitPath(units, own.unitId);
  for (let i = path.length - 1; i >= 0; i--) {
    const unit = byId.get(path[i]!)!;
    if (!unit.managerPositionId || unit.managerPositionId === employeePositionId) continue;
    const mgr = posById.get(unit.managerPositionId);
    if (mgr?.employeeId) return mgr.employeeId;
  }
  return null;
}

export function wouldCreateCycle(units: OrgUnit[], unitId: string, newParentId: string): boolean {
  return unitId === newParentId || unitPath(units, newParentId).includes(unitId);
}

export type TemplateUnit = { key: string; parentKey: string | null; type: UnitType; name: string; isFixed: boolean };

export function templateFor(activity: ActivityType): TemplateUnit[] {
  const base: TemplateUnit[] = [
    { key: 'root', parentKey: null, type: 'department', name: 'الإدارة العامة', isFixed: true },
    { key: 'hr', parentKey: 'root', type: 'department', name: 'الموارد البشرية', isFixed: true },
    { key: 'finance', parentKey: 'root', type: 'department', name: 'المالية', isFixed: true },
  ];
  if (activity === 'service') return base;
  return [...base, { key: 'main_branch', parentKey: 'root', type: 'branch', name: 'الفرع الرئيسي', isFixed: false }];
}
