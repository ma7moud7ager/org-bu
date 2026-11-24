'use client';
import { useState, useTransition } from 'react';
import { transfer } from '@/app/app/employees/actions';
import { destinationOptions, transferPayload, type Mode, type PositionOption, type TransferForm } from '@/lib/employee-actions';
import { riyadhToday } from '@/lib/dates';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export type UnitOption = { id: string; label: string };
export type RoleChoice = { id: string; name: string };

const select = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';

export function TransferDialog({ employeeId, mode, currentPositionId, units, positions, roles }: {
  employeeId: string; mode: Exclude<Mode, null>; currentPositionId: string | null;
  units: UnitOption[]; positions: PositionOption[]; roles: RoleChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<TransferForm>({ mode: 'vacant', targetPosition: '', unitId: units[0]?.id ?? '', title: '', roleId: roles[0]?.id ?? '', when: 'now', date: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const vacant = destinationOptions(positions, f.unitId, currentPositionId);
  const label = mode === 'direct' ? 'نقل الموظف' : 'رفع طلب نقل';
  if (done) return <p className="text-sm text-teal-700">{done}</p>;
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{label}</h2>
      <Field label="الوحدة الجديدة">
        <select className={select} value={f.unitId} onChange={(e) => setF({ ...f, unitId: e.target.value, targetPosition: '' })}>
          {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
      </Field>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={f.mode === 'vacant'} onChange={() => setF({ ...f, mode: 'vacant' })} /> منصب شاغر</label>
        <label className="flex items-center gap-1"><input type="radio" checked={f.mode === 'new'} onChange={() => setF({ ...f, mode: 'new' })} /> منصب جديد</label>
      </div>
      {f.mode === 'vacant' ? (
        vacant.length ? (
          <Field label="المنصب">
            <select className={select} value={f.targetPosition} onChange={(e) => setF({ ...f, targetPosition: e.target.value })}>
              <option value="">اختر منصبًا</option>
              {vacant.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        ) : <p className="text-sm text-slate-500">لا توجد مناصب شاغرة في هذه الوحدة. اختر &quot;منصب جديد&quot;.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="المسمى الوظيفي"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="الدور">
            <select className={select} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
      )}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={f.when === 'now'} onChange={() => setF({ ...f, when: 'now' })} /> فوري</label>
        <label className="flex items-center gap-1"><input type="radio" checked={f.when === 'date'} onChange={() => setF({ ...f, when: 'date' })} /> في تاريخ</label>
        {f.when === 'date' ? <Input type="date" min={riyadhToday()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /> : null}
      </div>
      {mode === 'request' ? <p className="text-xs text-slate-500">سيصل الطلب للموارد البشرية للموافقة.</p> : null}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => run(async () => {
          setError(null);
          const r = await transfer(mode, employeeId, transferPayload(f));
          if (r.ok) setDone(mode === 'request' ? 'تم رفع الطلب للموارد البشرية.' : f.when === 'date' ? 'تمت جدولة النقل.' : 'تم النقل.');
          else setError(r.error);
        })}>تأكيد</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </Card>
  );
}
