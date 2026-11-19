'use client';
import { useState, useTransition } from 'react';
import { subscriptionBadge } from '@/lib/format';
import { setCompanyStatus, setSubscription } from '@/app/admin/actions';
import { Button, ErrorText } from '@/components/ui';

export type CompanyRow = { company_id: string; legal_name: string; cr_number: string; activity_type: string; status: string; sub_status: string | null; plan_id: string | null; plan_name: string | null; ends_at: string | null; employee_count: number };
export type PlanOption = { id: string; name: string };

const TONE = { green: 'bg-green-100 text-green-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', gray: 'bg-slate-100 text-slate-600' };
const ACTIVITY: Record<string, string> = { commercial: 'تجاري', service: 'خدمي', mixed: 'مختلط' };

export function CompaniesTable({ rows, plans }: { rows: CompanyRow[]; plans: PlanOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{['الشركة', 'السجل', 'النشاط', 'الموظفين', 'الاشتراك', 'الباقة', 'ينتهي', ''].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = subscriptionBadge(r.sub_status ?? 'expired', r.ends_at);
            return (
              <tr key={r.company_id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">{r.legal_name}{r.status === 'suspended' ? <span className="ms-2 text-xs text-red-600">موقوفة</span> : null}</td>
                <td className="px-4 py-2" dir="ltr">{r.cr_number}</td>
                <td className="px-4 py-2">{ACTIVITY[r.activity_type] ?? r.activity_type}</td>
                <td className="px-4 py-2">{r.employee_count}</td>
                <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 text-xs ${TONE[b.tone]}`}>{b.label}</span></td>
                <td className="px-4 py-2">{r.plan_name ?? '—'}</td>
                <td className="px-4 py-2">{r.ends_at ? new Date(r.ends_at).toLocaleDateString('ar-SA') : '—'}</td>
                <td className="px-4 py-2">
                  {editing === r.company_id ? <SubscriptionEditor row={r} plans={plans} onDone={() => setEditing(null)} /> : <button className="text-teal-700" onClick={() => setEditing(r.company_id)}>إدارة</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="p-4 text-sm text-slate-400">لا توجد شركات مشتركة بعد.</p> : null}
    </div>
  );
}

function SubscriptionEditor({ row, plans, onDone }: { row: CompanyRow; plans: PlanOption[]; onDone: () => void }) {
  const [status, setStatus] = useState(row.sub_status ?? 'trial');
  const [planId, setPlanId] = useState(row.plan_id ?? '');
  const [endsAt, setEndsAt] = useState(row.ends_at?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="w-56 space-y-2">
      <select className="w-full rounded border p-1" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="trial">تجريبي</option><option value="active">نشط</option><option value="expired">منتهي</option><option value="cancelled">ملغي</option>
      </select>
      <select className="w-full rounded border p-1" value={planId} onChange={(e) => setPlanId(e.target.value)}>
        <option value="">بدون باقة</option>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input type="date" className="w-full rounded border p-1" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-1">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await setSubscription(row.company_id, { status, planId: planId || null, endsAt: endsAt ? new Date(endsAt + 'T23:59:59Z').toISOString() : null });
          if (r.ok) onDone(); else setError(r.error);
        })}>حفظ</Button>
        <Button variant={row.status === 'suspended' ? 'ghost' : 'danger'} disabled={pending} onClick={() => start(async () => {
          const r = await setCompanyStatus(row.company_id, row.status === 'suspended' ? 'active' : 'suspended');
          if (r.ok) onDone(); else setError(r.error);
        })}>{row.status === 'suspended' ? 'إعادة تفعيل' : 'إيقاف الشركة'}</Button>
        <Button variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}
