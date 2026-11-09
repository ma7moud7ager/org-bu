import { describe, it, expect } from 'vitest';
import { unitPath, branchOf, resolveDirectManager, wouldCreateCycle, templateFor, type OrgUnit, type PositionRef } from '../src/org-tree';

const units: OrgUnit[] = [
  { id: 'root', parentId: null, type: 'department', name: 'الإدارة العامة', isFixed: true, managerPositionId: 'p-root' },
  { id: 'B', parentId: 'root', type: 'branch', name: 'فرع', isFixed: false, managerPositionId: 'p-B' },
  { id: 'D', parentId: 'B', type: 'department', name: 'إدارة', isFixed: false, managerPositionId: 'p-D' },
  { id: 'S', parentId: 'D', type: 'section', name: 'قسم', isFixed: false, managerPositionId: null },
];
const positions: PositionRef[] = [
  { id: 'p-root', unitId: 'root', isManager: true, employeeId: 'e-root' },
  { id: 'p-B', unitId: 'B', isManager: true, employeeId: 'e-B' },
  { id: 'p-D', unitId: 'D', isManager: true, employeeId: 'e-D' },
  { id: 'p-S1', unitId: 'S', isManager: false, employeeId: 'e-S1' },
];

describe('org tree', () => {
  it('unitPath goes root to unit', () => {
    expect(unitPath(units, 'S')).toEqual(['root', 'B', 'D', 'S']);
  });
  it('unitPath throws ORG_UNIT_CYCLE on a loop', () => {
    const loop: OrgUnit[] = [
      { ...units[1]!, parentId: 'D' },
      { ...units[2]!, parentId: 'B' },
    ];
    expect(() => unitPath(loop, 'D')).toThrow('ORG_UNIT_CYCLE');
  });
  it('employee in unmanaged section reports to dept manager', () => {
    expect(resolveDirectManager(units, positions, 'p-S1')).toBe('e-D');
  });
  it('dept manager reports to branch manager', () => {
    expect(resolveDirectManager(units, positions, 'p-D')).toBe('e-B');
  });
  it('root manager has no manager', () => {
    expect(resolveDirectManager(units, positions, 'p-root')).toBeNull();
  });
  it('vacant dept manager position walks up to branch', () => {
    const vacant = positions.map((p) => (p.id === 'p-D' ? { ...p, employeeId: null } : p));
    expect(resolveDirectManager(units, vacant, 'p-S1')).toBe('e-B');
  });
  it('branchOf finds nearest branch', () => {
    expect(branchOf(units, 'S')).toBe('B');
    expect(branchOf(units, 'root')).toBeNull();
  });
  it('detects cycle when moving branch under its section', () => {
    expect(wouldCreateCycle(units, 'B', 'S')).toBe(true);
    expect(wouldCreateCycle(units, 'S', 'B')).toBe(false);
  });
  it('templates', () => {
    expect(templateFor('service').some((u) => u.type === 'branch')).toBe(false);
    expect(templateFor('commercial').filter((u) => u.type === 'branch')).toHaveLength(1);
    for (const a of ['commercial', 'service', 'mixed'] as const) {
      expect(templateFor(a).filter((u) => u.isFixed)).toHaveLength(3);
    }
  });
});
