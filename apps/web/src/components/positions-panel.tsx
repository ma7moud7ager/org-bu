'use client';
import { useState, useTransition } from 'react';
import { messageFor } from '@orgbu/shared';
import type { ActorBundle } from '@/lib/actor-types';
import type { TreeNode } from '@/lib/tree';
import { assignableRoles } from '@/lib/roles';
import { inviteUrl, whatsappShareUrl } from '@/lib/share';
import { createInvite, createPosition } from '@/app/app/structure/actions';
import type { PositionDetail, RoleRow } from '@/components/org-tree';
import { Button, ErrorText, Input } from '@/components/ui';

export function PositionsPanel({ node, bundle, details, roles, canManage, canInvite }: {
  node: TreeNode; bundle: ActorBundle; details: Record<string, PositionDetail>; roles: RoleRow[]; canManage: boolean; canInvite: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [inviteFor, setInviteFor] = useState<string | null>(null);

  return (
    <div className="mt-2 space-y-1 text-sm">
      {node.positions.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-slate-600">
          <span>{details[p.id]?.title}</span>
          {p.isManager ? <span className="text-xs text-amber-700">مدير</span> : null}
          <span className="text-slate-400">— {details[p.id]?.employeeName ?? 'شاغر'}</span>
          {!p.employeeId && canInvite ? <button className="text-xs text-teal-700" onClick={() => setInviteFor(p.id)}>دعوة</button> : null}
        </div>
      ))}
      {canManage ? (
        adding ? (
          <NewPosition node={node} bundle={bundle} roles={roles} onDone={() => setAdding(false)} />
        ) : (
          <button className="text-xs text-teal-700" onClick={() => setAdding(true)}>+ منصب</button>
        )
      ) : null}
      {inviteFor ? <InviteDialog positionId={inviteFor} title={details[inviteFor]?.title ?? ''} unitName={node.name} companyName={bundle.companyName} onClose={() => setInviteFor(null)} /> : null}
    </div>
  );
}

function NewPosition({ node, bundle, roles, onDone }: { node: TreeNode; bundle: ActorBundle; roles: RoleRow[]; onDone: () => void }) {
  const options = assignableRoles(roles.map((r) => ({ id: r.id, name: r.name, systemKey: r.system_key, permissions: r.role_permissions.map((x) => x.permission) })), bundle.grants);
  const [title, setTitle] = useState('');
  const [roleId, setRoleId] = useState(options.find((o) => o.systemKey === 'employee')?.id ?? '');
  const [isManager, setIsManager] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      <Input placeholder="المسمى الوظيفي" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="w-full rounded-lg border p-2 text-sm" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={isManager} onChange={(e) => setIsManager(e.target.checked)} />مدير هذه الوحدة</label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await createPosition(node.id, title, roleId, isManager); if (r.ok) onDone(); else setError(r.error); })}>حفظ</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}

function InviteDialog({ positionId, title, unitName, companyName, onClose }: { positionId: string; title: string; unitName: string; companyName: string; onClose: () => void }) {
  const [sentTo, setSentTo] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const message = link ? `تمت دعوتك للانضمام إلى ${companyName} في منصب ${title}: ${link}` : '';
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-label="دعوة موظف">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6">
        <h2 className="text-lg font-bold">دعوة موظف: {title}</h2>
        <p className="text-sm text-slate-500">{unitName}</p>
        {!link ? (
          <>
            <Input placeholder="جوال أو بريد المرشح (اختياري)" value={sentTo} onChange={(e) => setSentTo(e.target.value)} />
            <ErrorText>{error}</ErrorText>
            <Button disabled={pending} onClick={() => start(async () => {
              const r = await createInvite(positionId, sentTo);
              if (r.ok) setLink(inviteUrl(window.location.origin, r.data)); else setError(r.error ?? messageFor('UNKNOWN'));
            })}>إنشاء رابط الدعوة</Button>
          </>
        ) : (
          <>
            <p className="break-all rounded-lg bg-slate-50 p-3 text-xs" dir="ltr">{link}</p>
            <p className="text-xs text-slate-500">صالح لمدة 7 أيام ولشخص واحد فقط. لن يظهر الرابط مرة أخرى.</p>
            <div className="flex gap-2">
              <Button onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? 'تم النسخ' : 'نسخ الرابط'}</Button>
              <a className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white" href={whatsappShareUrl(message)} target="_blank" rel="noreferrer">مشاركة عبر واتساب</a>
            </div>
          </>
        )}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>إغلاق</Button></div>
      </div>
    </div>
  );
}
