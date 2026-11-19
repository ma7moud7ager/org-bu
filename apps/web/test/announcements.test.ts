import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_GRANTS, type OrgUnit } from '@orgbu/shared';
import { canPublishCompanyWide, publishableUnits } from '@/lib/announcements';
import { buildTree } from '@/lib/tree';

const u = (id: string, parentId: string | null, type: OrgUnit['type'] = 'department'): OrgUnit => ({ id, parentId, type, name: id, isFixed: false, managerPositionId: null });
const tree = buildTree([u('root', null), u('D', 'root'), u('S', 'D', 'section'), u('X', 'root')], []);

describe('announcements gating', () => {
  it('hr can publish company-wide', () => expect(canPublishCompanyWide(DEFAULT_ROLE_GRANTS.hr)).toBe(true));
  it('unit manager cannot publish company-wide', () => expect(canPublishCompanyWide(DEFAULT_ROLE_GRANTS.unit_manager)).toBe(false));
  it('unit manager can target own unit and sections only', () => {
    const ids = publishableUnits(tree, DEFAULT_ROLE_GRANTS.unit_manager, { employeeId: 'e', unitPath: ['root', 'D'], branchId: null }).map((n) => n.id);
    expect(ids.sort()).toEqual(['D', 'S']);
  });
});
