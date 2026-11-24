import { describe, it, expect } from 'vitest';
import { hasPermission, DEFAULT_ROLE_GRANTS, type ActorContext } from '../src/permissions';

const g = DEFAULT_ROLE_GRANTS;
const actor = (p: Partial<ActorContext>): ActorContext => ({ employeeId: 'me', unitPath: ['root'], branchId: null, ...p });

describe('hasPermission', () => {
  it('company_admin can edit employees anywhere', () => {
    expect(hasPermission(g.company_admin, 'employees.edit', actor({}), { unitPath: ['root', 'x', 'y'], branchId: 'b9' })).toBe(true);
  });
  it('branch_manager is limited to own branch', () => {
    const a = actor({ unitPath: ['root', 'b1'], branchId: 'b1' });
    expect(hasPermission(g.branch_manager, 'employees.edit', a, { unitPath: ['root', 'b1', 'd'], branchId: 'b1' })).toBe(true);
    expect(hasPermission(g.branch_manager, 'employees.edit', a, { unitPath: ['root', 'b2'], branchId: 'b2' })).toBe(false);
    expect(hasPermission(g.branch_manager, 'employees.edit', actor({ branchId: null }), { unitPath: ['root'], branchId: null })).toBe(false);
  });
  it('unit_manager sees own unit and below only', () => {
    const a = actor({ unitPath: ['root', 'd1'] });
    expect(hasPermission(g.unit_manager, 'employees.view', a, { unitPath: ['root', 'd1', 's1'], branchId: null })).toBe(true);
    expect(hasPermission(g.unit_manager, 'employees.view', a, { unitPath: ['root', 'd2'], branchId: null })).toBe(false);
    expect(hasPermission(g.unit_manager, 'employees.view', a, { unitPath: ['root'], branchId: null })).toBe(false);
  });
  it('employee can view self only', () => {
    expect(hasPermission(g.employee, 'employees.view', actor({}), { employeeId: 'me', unitPath: ['root'], branchId: null })).toBe(true);
    expect(hasPermission(g.employee, 'employees.view', actor({}), { employeeId: 'other', unitPath: ['root'], branchId: null })).toBe(false);
  });
  it('finance cannot edit employees', () => {
    expect(hasPermission(g.finance, 'employees.edit', actor({}), { unitPath: ['root'], branchId: null })).toBe(false);
  });
});

describe('phase 2a grants', () => {
  it('hr and company_admin decide requests and transfer company-wide', () => {
    for (const role of [g.hr, g.company_admin]) {
      expect(role).toContainEqual({ permission: 'requests.decide', scope: 'company' });
      expect(role).toContainEqual({ permission: 'employees.transfer', scope: 'company' });
    }
  });
  it('branch_manager requests termination/transfer within the branch only', () => {
    expect(g.branch_manager).toContainEqual({ permission: 'employees.request_terminate', scope: 'branch' });
    expect(g.branch_manager).toContainEqual({ permission: 'employees.request_transfer', scope: 'branch' });
    expect(g.branch_manager.some((x) => x.permission === 'employees.terminate')).toBe(false);
  });
});
