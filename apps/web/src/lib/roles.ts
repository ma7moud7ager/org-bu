import type { Grant } from '@orgbu/shared';

export type RoleOption = { id: string; name: string; systemKey: string | null; permissions: string[] };

/** Mirrors DB can_assign_role(): roles granting roles.manage need roles.manage to assign. */
export function assignableRoles(roles: RoleOption[], grants: Grant[]): RoleOption[] {
  const canManageRoles = grants.some((g) => g.permission === 'roles.manage');
  return roles.filter((r) => canManageRoles || !r.permissions.includes('roles.manage'));
}
