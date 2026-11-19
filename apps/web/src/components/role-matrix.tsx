'use client';
import { useState, useTransition } from 'react';
import { PERMISSIONS, type Grant, type Permission, type Scope } from '@orgbu/shared';
import { PERMISSION_LABELS_AR, SCOPE_LABELS_AR } from '@/lib/role-matrix';
import { createRole, saveGrants } from '@/app/app/roles/actions';
import { Button, Card, ErrorText, Input } from '@/components/ui';

type Role = { id: string; name: string; system_key: string | null; role_permissions: Grant[] };

export function RoleMatrix({ roles, writable }: { roles: Role[]; writable: boolean }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      {roles.map((r) => <RoleCard key={r.id} role={r} writable={writable} />)}
      {writable ? (
        <Card className="flex gap-2">
          <Input placeholder="اسم دور جديد" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={pending} onClick={() => start(async () => { const x = await createRole(name); if (x.ok) setName(''); else setError(x.error); })}>إضافة دور</Button>
          <ErrorText>{error}</ErrorText>
        </Card>
      ) : null}
    </div>
  );
}

function RoleCard({ role, writable }: { role: Role; writable: boolean }) {
  const initial = Object.fromEntries(role.role_permissions.map((g) => [g.permission, g.scope])) as Partial<Record<Permission, Scope>>;
  const [scopes, setScopes] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const after: Grant[] = (Object.entries(scopes) as [Permission, Scope][]).map(([permission, scope]) => ({ permission, scope }));
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{role.name}{role.system_key ? <span className="ms-2 text-xs font-normal text-slate-400">دور أساسي</span> : null}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span>{PERMISSION_LABELS_AR[p]}</span>
            <select disabled={!writable} className="rounded border bg-white p-1 text-xs" value={scopes[p] ?? ''} onChange={(e) => {
              const v = e.target.value as Scope | '';
              const next = { ...scopes };
              if (v) next[p] = v; else delete next[p];
              setScopes(next);
            }}>
              <option value="">لا يوجد</option>
              {(Object.keys(SCOPE_LABELS_AR) as Scope[]).map((s) => <option key={s} value={s}>{SCOPE_LABELS_AR[s]}</option>)}
            </select>
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {msg ? <p className="text-sm text-teal-700">{msg}</p> : null}
      {writable ? <Button disabled={pending} onClick={() => start(async () => {
        setError(null); setMsg(null);
        const r = await saveGrants(role.id, role.role_permissions, after);
        if (r.ok) setMsg('تم الحفظ'); else setError(r.error);
      })}>حفظ الصلاحيات</Button> : null}
    </Card>
  );
}
