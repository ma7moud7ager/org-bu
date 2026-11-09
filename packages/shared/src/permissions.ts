export type Scope = 'company' | 'branch' | 'unit' | 'self';

export const PERMISSIONS = [
  'structure.manage',
  'roles.manage',
  'employees.invite',
  'employees.view',
  'employees.edit',
  'employees.terminate',
  'employees.view_sensitive',
  'announcements.publish',
  'subscription.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type Grant = { permission: Permission; scope: Scope };
export type RoleKey = 'company_admin' | 'hr' | 'finance' | 'branch_manager' | 'unit_manager' | 'employee';

const at = (scope: Scope, ...perms: Permission[]): Grant[] => perms.map((permission) => ({ permission, scope }));

export const DEFAULT_ROLE_GRANTS: Record<RoleKey, Grant[]> = {
  company_admin: at('company', ...PERMISSIONS),
  hr: at(
    'company',
    'employees.invite',
    'employees.view',
    'employees.edit',
    'employees.terminate',
    'employees.view_sensitive',
    'announcements.publish',
    'structure.manage',
  ),
  finance: at('company', 'employees.view'),
  branch_manager: at('branch', 'employees.invite', 'employees.view', 'employees.edit', 'announcements.publish'),
  unit_manager: at('unit', 'employees.view', 'announcements.publish'),
  employee: at('self', 'employees.view'),
};

export type ActorContext = { employeeId: string; unitPath: string[]; branchId: string | null };
export type Target = { employeeId?: string; unitPath: string[]; branchId: string | null };

function scopeMatches(scope: Scope, actor: ActorContext, target: Target): boolean {
  switch (scope) {
    case 'company':
      return true;
    case 'branch':
      return actor.branchId !== null && actor.branchId === target.branchId;
    case 'unit':
      return (
        target.unitPath.length >= actor.unitPath.length && actor.unitPath.every((id, i) => target.unitPath[i] === id)
      );
    case 'self':
      return target.employeeId !== undefined && target.employeeId === actor.employeeId;
  }
}

export function hasPermission(grants: Grant[], permission: Permission, actor: ActorContext, target: Target): boolean {
  return grants.some((g) => g.permission === permission && scopeMatches(g.scope, actor, target));
}
