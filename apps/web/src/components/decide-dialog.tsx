'use client';
import { useState, useTransition } from 'react';
import { decideRequest } from '@/app/app/requests/actions';
import { riyadhToday } from '@/lib/dates';
import type { RequestRow } from '@/lib/request-row';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export function DecideDialog({ r }: { r: RequestRow }) {
  const [mode, setMode] = useState<'approve' | 'reject' | 'postpone' | null>(null);
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const [date, setDate] = useState((r.type === 'termination' ? r.payload.last_day : r.payload.run_at) as string | null ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  if (!mode) {
    return (
      <div className="flex gap-2">
        <Button onClick={() => setMode('approve')}>موافقة</Button>
        <Button variant="ghost" onClick={() => setMode('postpone')}>تأجيل</Button>
        <Button variant="danger" onClick={() => setMode('reject')}>رفض</Button>
      </div>
    );
  }
  function submit() {
    run(async () => {
      setError(null);
      const payload = mode === 'approve'
        ? { ...r.payload, ...(r.type === 'termination' ? { last_day: date } : { run_at: date || null }) }
        : null;
      const res = await decideRequest(r.id, mode!, note, payload, mode === 'postpone' ? until || null : null);
      if (!res.ok) setError(res.error);
    });
  }
  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {mode === 'approve' ? (
        <Field label={r.type === 'termination' ? 'آخر يوم عمل (يمكن تعديله)' : 'تاريخ التنفيذ (فارغ = فوري)'}>
          <Input type="date" min={riyadhToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      ) : null}
      {mode === 'postpone' ? <Field label="التأجيل حتى"><Input type="date" min={riyadhToday()} value={until} onChange={(e) => setUntil(e.target.value)} /></Field> : null}
      <Field label={mode === 'reject' ? 'سبب الرفض' : 'ملاحظة (اختياري)'}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button variant={mode === 'reject' ? 'danger' : 'primary'} disabled={pending} onClick={submit}>تأكيد</Button>
        <Button variant="ghost" onClick={() => setMode(null)}>رجوع</Button>
      </div>
    </div>
  );
}
