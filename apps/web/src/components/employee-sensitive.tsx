'use client';
import { useState, useTransition } from 'react';
import { revealIdentity, updateContract } from '@/app/app/employees/actions';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export function EmployeeSensitive({ employeeId, canReveal, canEdit, contractStart, contractEnd }: {
  employeeId: string; canReveal: boolean; canEdit: boolean; contractStart: string | null; contractEnd: string | null;
}) {
  const [number, setNumber] = useState<string | null>(null);
  const [start, setStart] = useState(contractStart ?? '');
  const [end, setEnd] = useState(contractEnd ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <Card className="space-y-4">
      {canReveal ? (
        <div className="flex items-center gap-3 text-sm">
          {number ? <span dir="ltr" className="font-mono">{number}</span> : (
            <Button variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await revealIdentity(employeeId); if (r.ok) setNumber(r.data ?? '—'); else setError(r.error); })}>إظهار رقم الوثيقة</Button>
          )}
          <span className="text-xs text-slate-400">يتم تسجيل كل عملية إظهار</span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="بداية العقد"><Input type="date" value={start} disabled={!canEdit} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="نهاية العقد"><Input type="date" value={end} disabled={!canEdit} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {msg ? <p className="text-sm text-teal-700">{msg}</p> : null}
      {canEdit ? (
        <Button disabled={pending} onClick={() => run(async () => {
          setError(null); setMsg(null);
          const r = await updateContract(employeeId, start || null, end || null);
          if (r.ok) setMsg('تم الحفظ'); else setError(r.error);
        })}>حفظ بيانات العقد</Button>
      ) : null}
    </Card>
  );
}
