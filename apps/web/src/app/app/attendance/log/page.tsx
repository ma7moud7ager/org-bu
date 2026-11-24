import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor, toOrgUnit, type UnitRow } from '@/lib/actor';
import { attendanceSummary, reasonText, riyadhTime, type Punch } from '@/lib/attendance';
import { riyadhToday } from '@/lib/dates';

type Row = { employee_id: string; employee_name: string; unit_name: string; records: Punch[]; rejected: Array<Punch & { reason: string }> };

export default async function AttendanceLogPage({ searchParams }: { searchParams: Promise<{ date?: string; unit?: string }> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : riyadhToday();
  const unit = sp.unit || null;
  await loadActor();
  const supabase = await createServerSupabase();
  const [{ data }, units] = await Promise.all([
    supabase.rpc('attendance_day', { p_date: date, p_unit: unit }),
    supabase.from('org_units').select('id, parent_id, type, name, is_fixed, manager_position_id').eq('type', 'branch').order('name'),
  ]);
  const rows = (data ?? []) as Row[];
  const branches = ((units.data ?? []) as UnitRow[]).map(toOrgUnit);
  const present = rows.filter((r) => r.records.length).length;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">سجل الحضور</h1>
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="block text-slate-500">التاريخ</span>
          <input type="date" name="date" defaultValue={date} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="space-y-1"><span className="block text-slate-500">الفرع</span>
          <select name="unit" defaultValue={unit ?? ''} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value="">الكل</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></label>
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-white">عرض</button>
        <span className="text-slate-500">حضر {present} من {rows.length}</span>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{['الموظف', 'الوحدة', 'أول حضور', 'آخر انصراف', 'ساعات العمل', 'محاولات مرفوضة'].map((h) => <th key={h} className="px-4 py-2 text-start font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = attendanceSummary(r.records);
              return (
                <tr key={r.employee_id} className="border-t border-slate-100">
                  <td className="px-4 py-2"><Link className="text-teal-700" href={`/app/employees/${r.employee_id}`}>{r.employee_name}</Link></td>
                  <td className="px-4 py-2">{r.unit_name}</td>
                  <td className="px-4 py-2" dir="ltr">{s.firstIn ? riyadhTime(s.firstIn) : <span className="text-slate-400">لم يسجل</span>}</td>
                  <td className="px-4 py-2" dir="ltr">{riyadhTime(s.lastOut)}</td>
                  <td className="px-4 py-2">{s.workedMinutes ? `${Math.floor(s.workedMinutes / 60)}:${String(s.workedMinutes % 60).padStart(2, '0')}` : '—'}{s.open ? ' (لم ينصرف)' : ''}</td>
                  <td className="px-4 py-2 text-red-700">{r.rejected.map((x) => `${riyadhTime(x.at)} ${reasonText(x.reason)}`).join('، ') || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
