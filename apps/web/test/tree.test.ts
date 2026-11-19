import { describe, it, expect } from 'vitest';
import type { OrgUnit, PositionRef } from '@orgbu/shared';
import { buildTree, deleteRequirement, findNode, subtreeIds } from '@/lib/tree';

const u = (id: string, parentId: string | null, type: OrgUnit['type'], name: string, isFixed = false): OrgUnit => ({
  id, parentId, type, name, isFixed, managerPositionId: null,
});
const units = [
  u('root', null, 'department', 'الإدارة العامة', true),
  u('D', 'root', 'department', 'التسويق'),
  u('HR', 'root', 'department', 'الموارد البشرية', true),
  u('B', 'root', 'branch', 'فرع جدة'),
  u('S', 'D', 'section', 'الأداء'),
  u('T', 'root', 'team', 'فريق'),
];
const positions: PositionRef[] = [{ id: 'p1', unitId: 'S', isManager: false, employeeId: 'e1' }, { id: 'p2', unitId: 'S', isManager: false, employeeId: null }];

describe('buildTree', () => {
  const tree = buildTree(units, positions);
  it('counts filled positions in the subtree', () => {
    expect(tree.employeeCount).toBe(1);
    expect(findNode(tree, 'D')!.employeeCount).toBe(1);
  });
  it('lists branches first, then by Arabic name', () => {
    expect(tree.children.map((c) => c.id)).toEqual(['B', 'D', 'HR', 'T']);
  });
  it('orphan unit is attached to the root', () => {
    const t = buildTree([...units, u('O', 'gone', 'team', 'يتيم')], positions);
    expect(t.children.some((c) => c.id === 'O')).toBe(true);
  });
  it('subtreeIds includes the node and descendants', () => {
    expect(subtreeIds(findNode(tree, 'D')!).sort()).toEqual(['D', 'S']);
  });
});

describe('deleteRequirement', () => {
  const tree = buildTree(units, positions);
  it('root is forbidden', () => expect(deleteRequirement(tree, true)).toBe('forbidden'));
  it('unit with children needs a replacement', () => expect(deleteRequirement(findNode(tree, 'D')!, false)).toBe('needs_replacement'));
  it('empty fixed unit is fixed', () => expect(deleteRequirement(findNode(tree, 'HR')!, false)).toBe('fixed'));
  it('empty team is ok', () => expect(deleteRequirement(findNode(tree, 'T')!, false)).toBe('ok'));
  it('unit with only vacant positions needs a replacement', () => expect(deleteRequirement(findNode(tree, 'S')!, false)).toBe('needs_replacement'));
});
