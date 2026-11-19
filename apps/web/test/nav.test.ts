import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_GRANTS, type RoleKey } from '@orgbu/shared';
import { navItemsFor } from '@/lib/nav';
import type { ActorBundle } from '@/lib/actor-types';

const bundle = (role: RoleKey): ActorBundle => ({
  employee: { id: 'e', fullName: 'x', companyId: 'c', positionId: 'p' },
  actor: { employeeId: 'e', unitPath: ['root'], branchId: null },
  grants: DEFAULT_ROLE_GRANTS[role],
  companyName: 'شركة',
  writable: true,
});
const hrefs = (role: RoleKey) => navItemsFor(bundle(role)).map((i) => i.href);

describe('navItemsFor', () => {
  it('employee sees announcements and structure only', () => {
    expect(hrefs('employee')).toEqual(['/app/announcements', '/app/structure']);
  });
  it('company admin sees everything', () => {
    expect(hrefs('company_admin')).toEqual(['/app/announcements', '/app/structure', '/app/employees', '/app/roles']);
  });
  it('finance sees employees', () => {
    expect(hrefs('finance')).toContain('/app/employees');
  });
  it('hr does not see roles', () => {
    expect(hrefs('hr')).not.toContain('/app/roles');
  });
});
