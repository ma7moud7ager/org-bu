import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { maskIdentity } from '@/lib/format';

type Row = { id: string; full_name: string; phone: string; identity_last4: string | null; status: string; positions: { title: string; org_units: { name: string } | null } | null };

export default async function EmployeesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('employees').select('id, full_name, phone, identity_last4, status, positions(title, org_units(name))').order('full_name');
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الموظفين <span className="text-sm font-normal text-slate-400">({rows.length})</span></h1>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['الاسم', 'المنصب', 'الوحدة', 'الجوال', 'الهوية', 'الحالة'].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2"><Link className="text-teal-700" href={`/app/employees/${r.id}`}>{r.full_name}</Link></td>
                <td className="px-4 py-2">{r.positions?.title ?? '—'}</td>
                <td className="px-4 py-2">{r.positions?.org_units?.name ?? '—'}</td>
                <td className="px-4 py-2" dir="ltr">{r.phone}</td>
                <td className="px-4 py-2" dir="ltr">{maskIdentity(r.identity_last4)}</td>
                <td className="px-4 py-2">{r.status === 'active' ? 'نشط' : 'منتهية خدمته'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
