'use client';
import { useState, useTransition } from 'react';
import { updateProfile, type ProfilePatch } from '@/app/app/employees/actions';
import { NATIONALITIES } from '@/lib/identity-form';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

const select = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';

export function EmployeeEditForm({ employeeId, initial }: { employeeId: string; initial: ProfilePatch }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const set = (k: keyof ProfilePatch) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value === '' ? null : e.target.value });
  const known = NATIONALITIES.some((n) => n.code === f.nationality);
  return (
    <Card className="space-y-4">
      <h2 className="font-bold">تعديل البيانات</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم الكامل"><Input aria-label="الاسم الكامل" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" value={f.email ?? ''} onChange={set('email')} /></Field>
        <Field label="تاريخ الميلاد"><Input type="date" value={f.birth_date ?? ''} onChange={set('birth_date')} /></Field>
        <Field label="النوع">
          <select className={select} value={f.gender ?? ''} onChange={set('gender')}>
            <option value="">—</option><option value="male">ذكر</option><option value="female">أنثى</option>
          </select>
        </Field>
        <Field label="الجنسية">
          <select className={select} value={f.nationality ?? ''} onChange={set('nationality')}>
            <option value="">—</option>
            {!known && f.nationality ? <option value={f.nationality}>{f.nationality}</option> : null}
            {NATIONALITIES.map((n) => <option key={n.code} value={n.code}>{n.name}</option>)}
          </select>
        </Field>
        <div />
        <Field label="بداية العقد"><Input type="date" value={f.contract_start ?? ''} onChange={set('contract_start')} /></Field>
        <Field label="نهاية العقد"><Input type="date" value={f.contract_end ?? ''} onChange={set('contract_end')} /></Field>
      </div>
      <ErrorText>{error}</ErrorText>
      {msg ? <p className="text-sm text-teal-700">{msg}</p> : null}
      <Button disabled={pending} onClick={() => run(async () => {
        setError(null); setMsg(null);
        const r = await updateProfile(employeeId, f);
        if (r.ok) setMsg('تم الحفظ'); else setError(r.error);
      })}>حفظ</Button>
    </Card>
  );
}
