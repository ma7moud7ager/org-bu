'use client';
import { useState, useTransition } from 'react';
import { updateMyDocument } from '@/app/app/me/actions';
import { daysUntil, expiryTone, type Tone } from '@/lib/dates';
import { IDENTITY_TYPE_AR, maskIdentity } from '@/lib/format';
import { toLatinDigits } from '@/lib/phone';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export type MyDocument = { identity_type: string | null; identity_last4: string | null; iqama_expiry: string | null; entry_date: string | null; nationality: string | null };

const TONE: Record<Tone, string> = { red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800', green: 'bg-green-100 text-green-800' };

export function Countdown({ date, now }: { date: string; now?: Date }) {
  const days = daysUntil(date, now);
  const text = days < 0 ? `منتهية منذ ${-days} يوم` : `باقي ${days} يوم`;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${TONE[expiryTone(days)]}`}>{text}</span>;
}

export function DocumentCard({ doc, now }: { doc: MyDocument; now?: Date }) {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const canUpdate = doc.identity_type === 'iqama' || doc.identity_type === 'border_number';
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">وثيقتي</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-slate-400">النوع</dt><dd>{doc.identity_type ? IDENTITY_TYPE_AR[doc.identity_type] ?? doc.identity_type : '—'}</dd></div>
        <div><dt className="text-slate-400">الرقم</dt><dd dir="ltr" className="text-end">{maskIdentity(doc.identity_last4)}</dd></div>
        {doc.iqama_expiry ? (
          <div className="col-span-2"><dt className="text-slate-400">انتهاء الإقامة</dt><dd className="flex items-center gap-2">{doc.iqama_expiry} <Countdown date={doc.iqama_expiry} now={now} /></dd></div>
        ) : null}
        {doc.identity_type === 'border_number' && doc.entry_date ? <div><dt className="text-slate-400">تاريخ الدخول</dt><dd>{doc.entry_date}</dd></div> : null}
      </dl>
      {msg ? <p className="text-sm text-teal-700">{msg}</p> : null}
      {canUpdate && !open ? <Button variant="ghost" onClick={() => setOpen(true)}>تحديث الإقامة</Button> : null}
      {open ? (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <Field label="رقم الإقامة"><Input dir="ltr" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
          <Field label="تاريخ انتهاء الإقامة الجديد"><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
          <p className="text-xs text-slate-500">سيصل تنبيه للموارد البشرية لمراجعة التحديث.</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(async () => {
              setError(null);
              const r = await updateMyDocument('iqama', toLatinDigits(number.trim()), expiry || null, null);
              if (r.ok) { setOpen(false); setMsg('تم تحديث الإقامة'); } else setError(r.error);
            })}>حفظ</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
