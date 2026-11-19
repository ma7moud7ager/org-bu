import { describe, it, expect } from 'vitest';
import { PERMISSIONS, type Grant } from '@orgbu/shared';
import { diffGrants, PERMISSION_LABELS_AR, SCOPE_LABELS_AR } from '@/lib/role-matrix';

describe('role matrix', () => {
  it('every permission has an Arabic label', () => {
    for (const p of PERMISSIONS) expect(PERMISSION_LABELS_AR[p]).toMatch(/[؀-ۿ]/);
    expect(Object.keys(SCOPE_LABELS_AR).sort()).toEqual(['branch', 'company', 'self', 'unit']);
  });
  it('changed scope is one add and one remove', () => {
    const before: Grant[] = [{ permission: 'employees.view', scope: 'unit' }];
    const after: Grant[] = [{ permission: 'employees.view', scope: 'branch' }];
    expect(diffGrants(before, after)).toEqual({ add: after, remove: before });
  });
  it('identical grants produce no changes', () => {
    const g: Grant[] = [{ permission: 'employees.view', scope: 'unit' }];
    expect(diffGrants(g, [...g])).toEqual({ add: [], remove: [] });
  });
});
