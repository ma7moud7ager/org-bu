'use client';
import type { ActorBundle } from '@/lib/actor-types';
import type { TreeNode } from '@/lib/tree';
import type { PositionDetail, RoleRow } from '@/components/org-tree';

export function PositionsPanel({ node, details }: { node: TreeNode; bundle: ActorBundle; details: Record<string, PositionDetail>; roles: RoleRow[]; canManage: boolean }) {
  if (!node.positions.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {node.positions.map((p) => (
        <li key={p.id} className="flex items-center gap-2 text-slate-600">
          <span>{details[p.id]?.title}</span>
          {p.isManager ? <span className="text-xs text-amber-700">مدير</span> : null}
          <span className="text-slate-400">— {details[p.id]?.employeeName ?? 'شاغر'}</span>
        </li>
      ))}
    </ul>
  );
}
