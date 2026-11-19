import { notFound } from 'next/navigation';
import { hasPermission } from '@orgbu/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor } from '@/lib/actor';
import { IDENTITY_TYPE_AR, maskIdentity } from '@/lib/format';
import { Card } from '@/components/ui';
import { EmployeeSensitive } from '@/components/employee-sensitive';

type Emp = {
  id: string; full_name: string; phone: string; email: string | null; birth_date: string | null; gender: string | null; nationality: string | null;
  identity_type: string | null; identity_last4: string | null; iqama_expiry: string | null; entry_date: string | null;
  contract_start: string | null; contract_end: string | null; status: string; positions: { title: string; org_unit_id: string } | null;
};

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const bundle = (await loadActor())!;
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, phone, email, birth_date, gender, nationality, identity_type, identity_last4, iqama_expiry, entry_date, contract_start, contract_end, status, positions(title, org_unit_id)')
    .eq('id', id)
    .maybeSingle();
  const e = data as unknown as Emp | null;
  if (!e) notFound();
  const unitId = e.positions?.org_unit_id;
  const { data: path } = unitId ? await supabase.rpc('unit_path', { p_unit: unitId }) : { data: [] };
  const { data: branch } = unitId ? await supabase.rpc('unit_branch', { p_unit: unitId }) : { data: null };
  const target = { employeeId: e.id, unitPath: (path as string[]) ?? [], branchId: (branch as string | null) ?? null };
  const canSee = hasPermission(bundle.grants, 'employees.view_sensitive', bundle.actor, target);
  const canEdit = bundle.writable && hasPermission(bundle.grants, 'employees.edit', bundle.actor, target);

  const rows: Array<[string, string | null]> = [
    ['المنصب', e.positions?.title ?? null], ['الجوال', e.phone], ['البريد', e.email], ['تاريخ الميلاد', e.birth_date],
    ['النوع', e.gender === 'male' ? 'ذكر' : e.gender === 'female' ? 'أنثى' : null], ['الجنسية', e.nationality],
    ['نوع الوثيقة', e.identity_type ? IDENTITY_TYPE_AR[e.identity_type] ?? e.identity_type : null],
    ['انتهاء الإقامة', e.iqama_expiry], ['تاريخ الدخول', e.entry_date],
  ];
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">{e.full_name}</h1>
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-slate-400">{k}</dt><dd>{v ?? '—'}</dd></div>
          ))}
          <div><dt className="text-slate-400">رقم الوثيقة</dt><dd dir="ltr" className="text-end">{maskIdentity(e.identity_last4)}</dd></div>
        </dl>
      </Card>
      <EmployeeSensitive employeeId={e.id} canReveal={canSee} canEdit={canEdit} contractStart={e.contract_start} contractEnd={e.contract_end} />
    </div>
  );
}
