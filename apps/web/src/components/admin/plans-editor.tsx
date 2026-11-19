'use client';
import { useState, useTransition } from 'react';
import { upsertPlan } from '@/app/admin/actions';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export type PlanRow = { id: string; name: string; price_monthly: number; price_yearly: number; max_employees: number; is_active: boolean };
const empty = { name: '', price_monthly: 0, price_yearly: 0, max_employees: 25, is_active: true };

export function PlansEditor({ plans }: { plans: PlanRow[] }) {
  return (
    <div className="space-y-3">
      {plans.map((p) => <PlanCard key={p.id} initial={p} />)}
      <PlanCard initial={{ ...empty }} isNew />
    </div>
  );
}

function PlanCard({ initial, isNew }: { initial: Omit<PlanRow, 'id'> & { id?: string }; isNew?: boolean }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const num = (k: 'price_monthly' | 'price_yearly' | 'max_employees') => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{isNew ? 'باقة جديدة' : p.name}</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="الاسم"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="شهريًا (ر.س)"><Input type="number" min={0} value={p.price_monthly} onChange={num('price_monthly')} /></Field>
        <Field label="سنويًا (ر.س)"><Input type="number" min={0} value={p.price_yearly} onChange={num('price_yearly')} /></Field>
        <Field label="أقصى عدد موظفين"><Input type="number" min={1} value={p.max_employees} onChange={num('max_employees')} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_active} onChange={(e) => setP({ ...p, is_active: e.target.checked })} /> متاحة للاشتراك</label>
      <ErrorText>{error}</ErrorText>
      {msg ? <p className="text-sm text-teal-700">{msg}</p> : null}
      <Button disabled={pending} onClick={() => start(async () => {
        setError(null); setMsg(null);
        const r = await upsertPlan(p);
        if (r.ok) { setMsg('تم الحفظ'); if (isNew) setP({ ...empty }); } else setError(r.error);
      })}>{isNew ? 'إضافة الباقة' : 'حفظ'}</Button>
    </Card>
  );
}
