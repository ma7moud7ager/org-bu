'use client';
import { useState, useTransition } from 'react';
import { terminate } from '@/app/app/employees/actions';
import { TERMINATION_REASONS, type Mode } from '@/lib/employee-actions';
import { riyadhToday } from '@/lib/dates';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export function TerminateDialog({ employeeId, mode }: { employeeId: string; mode: Exclude<Mode, null> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ reason: 'resignation', note: '', lastDay: riyadhToday() });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const label = mode === 'direct' ? 'إنهاء الخدمة' : 'رفع طلب إنهاء خدمة';
  if (done) return <p className="text-sm text-teal-700">{done}</p>;
  if (!open) return <Button variant="danger" onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <Card className="space-y-3 border-red-200">
      <h2 className="font-bold text-red-700">{label}</h2>
      <Field label="السبب">
        <select className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
          {TERMINATION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="آخر يوم عمل"><Input type="date" min={riyadhToday()} value={f.lastDay} onChange={(e) => setF({ ...f, lastDay: e.target.value })} /></Field>
      <Field label="ملاحظة"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <p className="text-xs text-slate-500">
        {f.lastDay === riyadhToday() ? 'سيتم إنهاء الخدمة فورًا ويصبح المنصب شاغرًا.' : 'سيتم التنفيذ تلقائيًا صباح آخر يوم عمل، ويمكن التراجع قبله.'}
        {mode === 'request' ? ' سيصل الطلب للموارد البشرية للموافقة.' : ''}
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button variant="danger" disabled={pending} onClick={() => run(async () => {
          setError(null);
          const r = await terminate(mode, employeeId, f);
          if (r.ok) setDone(mode === 'direct' ? 'تم تسجيل إنهاء الخدمة.' : 'تم رفع الطلب للموارد البشرية.'); else setError(r.error);
        })}>تأكيد</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </Card>
  );
}
