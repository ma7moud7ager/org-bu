import type { OrgUnit, PositionRef } from '@orgbu/shared';

export type TreeNode = OrgUnit & { children: TreeNode[]; positions: PositionRef[]; employeeCount: number };

export function buildTree(units: OrgUnit[], positions: PositionRef[]): TreeNode {
  const nodes = new Map<string, TreeNode>(units.map((u) => [u.id, { ...u, children: [], positions: [], employeeCount: 0 }]));
  for (const p of positions) nodes.get(p.unitId)?.positions.push(p);
  const root = [...nodes.values()].find((n) => n.parentId === null);
  if (!root) throw new Error('ORG_VALIDATION');
  for (const n of nodes.values()) {
    if (n === root) continue;
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    (parent ?? root).children.push(n);
  }
  const sortAndCount = (n: TreeNode): number => {
    n.children.sort((a, b) => (a.type === 'branch' ? 0 : 1) - (b.type === 'branch' ? 0 : 1) || a.name.localeCompare(b.name, 'ar'));
    n.employeeCount = n.positions.filter((p) => p.employeeId).length + n.children.reduce((s, c) => s + sortAndCount(c), 0);
    return n.employeeCount;
  };
  sortAndCount(root);
  return root;
}

export function findNode(tree: TreeNode, id: string): TreeNode | undefined {
  if (tree.id === id) return tree;
  for (const c of tree.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return undefined;
}

export function subtreeIds(node: TreeNode): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}

export function flatten(tree: TreeNode, depth = 0): Array<{ node: TreeNode; depth: number }> {
  return [{ node: tree, depth }, ...tree.children.flatMap((c) => flatten(c, depth + 1))];
}

export type DeleteRequirement = 'forbidden' | 'needs_replacement' | 'fixed' | 'ok';

export function deleteRequirement(node: TreeNode, isRoot: boolean): DeleteRequirement {
  if (isRoot) return 'forbidden';
  if (node.children.length > 0 || node.positions.length > 0) return 'needs_replacement';
  if (node.isFixed) return 'fixed';
  return 'ok';
}
