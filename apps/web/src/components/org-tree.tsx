'use client';
import { useState, useTransition } from 'react';
import { hasPermission, messageFor, wouldCreateCycle, type OrgUnit } from '@orgbu/shared';
import type { ActorBundle } from '@/lib/actor-types';
import { deleteRequirement, flatten, subtreeIds, type TreeNode } from '@/lib/tree';
import { createUnit, deleteUnit, moveUnit, renameUnit } from '@/app/app/structure/actions';
import { Button, ErrorText, Input } from '@/components/ui';
import { PositionsPanel } from '@/components/positions-panel';

export type RoleRow = { id: string; name: string; system_key: string | null; role_permissions: { permission: string }[] };
export type PositionDetail = { title: string; employeeName: string | null; roleId: string; showPhone: boolean };

const TYPE_LABEL: Record<OrgUnit['type'], string> = { branch: 'فرع', department: 'إدارة', section: 'قسم', team: 'فريق' };

type Dialog =
  | { kind: 'add'; node: TreeNode }
  | { kind: 'rename'; node: TreeNode }
  | { kind: 'move'; node: TreeNode }
  | { kind: 'delete'; node: TreeNode }
  | null;

export function OrgTree({ tree, bundle, positionDetails, roles }: { tree: TreeNode; bundle: ActorBundle; positionDetails: Record<string, PositionDetail>; roles: RoleRow[] }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const rows = flatten(tree);
  const allUnits = rows.map((r) => r.node);
  const can = (permission: 'structure.manage' | 'employees.invite', n: TreeNode) =>
    bundle.writable &&
    hasPermission(bundle.grants, permission, bundle.actor, { unitPath: pathOf(allUnits, n.id), branchId: branchOfNode(allUnits, n.id) });
  const canManage = (n: TreeNode) => can('structure.manage', n);

  return (
    <div className="space-y-2">
      {rows.map(({ node, depth }) => (
        <div key={node.id} style={{ marginInlineStart: depth * 24 }} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TYPE_LABEL[node.type]}</span>
            <span className="font-medium">{node.name}</span>
            {node.isFixed ? <span className="text-xs text-teal-700">ثابتة</span> : null}
            <span className="text-xs text-slate-400">{node.employeeCount} موظف</span>
            {canManage(node) ? (
              <span className="ms-auto flex gap-1 text-xs">
                <button className="text-teal-700" onClick={() => setDialog({ kind: 'add', node })}>+ وحدة</button>
                <button className="text-slate-500" onClick={() => setDialog({ kind: 'rename', node })}>تعديل الاسم</button>
                {node.parentId ? <button className="text-slate-500" onClick={() => setDialog({ kind: 'move', node })}>نقل</button> : null}
                {node.parentId ? <button className="text-red-600" onClick={() => setDialog({ kind: 'delete', node })}>حذف</button> : null}
              </span>
            ) : null}
          </div>
          <PositionsPanel node={node} bundle={bundle} details={positionDetails} roles={roles} canManage={canManage(node)} canInvite={can('employees.invite', node)} />
        </div>
      ))}
      {dialog ? <UnitDialog dialog={dialog} tree={tree} allUnits={allUnits} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function pathOf(units: TreeNode[], id: string): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const path: string[] = [];
  for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) path.unshift(cur.id);
  return path;
}

function branchOfNode(units: TreeNode[], id: string): string | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  for (const pid of pathOf(units, id).reverse()) if (byId.get(pid)?.type === 'branch') return pid;
  return null;
}

function UnitDialog({ dialog, tree, allUnits, onClose }: { dialog: NonNullable<Dialog>; tree: TreeNode; allUnits: TreeNode[]; onClose: () => void }) {
  const { node } = dialog;
  const [name, setName] = useState(dialog.kind === 'rename' ? node.name : '');
  const [type, setType] = useState<OrgUnit['type']>('department');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const excluded = new Set(subtreeIds(node));
  const others = allUnits.filter((u) => !excluded.has(u.id));
  const requirement = deleteRequirement(node, node.id === tree.id);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) onClose();
      else setError(r.error ?? messageFor('UNKNOWN'));
    });
  }

  function submit() {
    setError(null);
    if (dialog.kind === 'add') return run(() => createUnit(node.id, type, name));
    if (dialog.kind === 'rename') return run(() => renameUnit(node.id, name));
    if (dialog.kind === 'move') {
      if (!target) return setError(messageFor('ORG_VALIDATION'));
      if (wouldCreateCycle(allUnits, node.id, target)) return setError(messageFor('ORG_UNIT_CYCLE'));
      return run(() => moveUnit(node.id, target));
    }
    if (requirement === 'needs_replacement' && !target) return setError(messageFor('ORG_UNIT_NOT_EMPTY'));
    return run(() => deleteUnit(node.id, requirement === 'needs_replacement' ? target : null));
  }

  const title = { add: `إضافة وحدة تحت ${node.name}`, rename: 'تعديل الاسم', move: `نقل ${node.name}`, delete: `حذف ${node.name}` }[dialog.kind];
  const blocked = dialog.kind === 'delete' && (requirement === 'fixed' || requirement === 'forbidden');

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-label={title}>
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        {dialog.kind === 'add' ? (
          <>
            <select className="w-full rounded-lg border p-2 text-sm" value={type} onChange={(e) => setType(e.target.value as OrgUnit['type'])}>
              {(Object.keys(TYPE_LABEL) as OrgUnit['type'][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
            <Input placeholder="اسم الوحدة" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        ) : null}
        {dialog.kind === 'rename' ? <Input value={name} onChange={(e) => setName(e.target.value)} /> : null}
        {dialog.kind === 'move' || (dialog.kind === 'delete' && requirement === 'needs_replacement') ? (
          <>
            {dialog.kind === 'delete' ? <p className="text-sm text-slate-600">بها موظفين أو وحدات فرعية. اختر وحدة بديلة لنقلهم إليها قبل الحذف.</p> : null}
            <select className="w-full rounded-lg border p-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">اختر الوحدة</option>
              {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </>
        ) : null}
        {dialog.kind === 'delete' && requirement === 'fixed' ? <p className="text-sm text-slate-600">{messageFor('ORG_UNIT_FIXED')}</p> : null}
        {dialog.kind === 'delete' && requirement === 'ok' ? <p className="text-sm text-slate-600">سيتم حذف الوحدة نهائيًا.</p> : null}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          {!blocked ? <Button variant={dialog.kind === 'delete' ? 'danger' : 'primary'} disabled={pending} onClick={submit}>تأكيد</Button> : null}
        </div>
      </div>
    </div>
  );
}
