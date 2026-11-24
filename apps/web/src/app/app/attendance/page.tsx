import { createServerSupabase } from '@/lib/supabase/server';
import { reasonText, riyadhTime } from '@/lib/attendance';
import { Card } from '@/components/ui';
import { AttendanceButton } from './attendance-button';

type Today = {
  next_kind: 'in' | 'out'; fence_configured: boolean; fence_unit: string | null;
  records: Array<{ kind: 'in' | 'out'; at: string; result: string; reason: string | null }>;
};

export default async function AttendancePage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('my_attendance_today');
  const t = data as Today | null;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">حضوري</h1>
      {t?.fence_unit ? <p className="text-sm text-slate-500">موقع العمل: {t.fence_unit}</p> : null}
      <AttendanceButton nextKind={t?.next_kind ?? 'in'} fenceConfigured={t?.fence_configured ?? false} />
      <Card className="space-y-2">
        <h2 className="font-bold">تسجيلات اليوم</h2>
        {!t?.records.length ? <p className="text-sm text-slate-500">لا توجد تسجيلات اليوم.</p> : null}
        <ul className="space-y-1 text-sm">
          {t?.records.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-12" dir="ltr">{riyadhTime(r.at)}</span>
              <span>{r.kind === 'in' ? 'حضور' : 'انصراف'}</span>
              {r.result === 'accepted'
                ? <span className="text-teal-700">مقبول</span>
                : <span className="text-red-700">مرفوض — {reasonText(r.reason)}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
