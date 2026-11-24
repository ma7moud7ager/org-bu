import { createServerSupabase } from '@/lib/supabase/server';
import type { RequestRow } from '@/lib/request-row';
import { RequestCard } from '@/components/request-card';
import { CancelRequestButton } from '@/components/cancel-request-button';

export default async function MyRequestsPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('request_list', { p_mine: true });
  const rows = (data ?? []) as RequestRow[];
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">طلباتي</h1>
      {rows.length === 0 ? <p className="text-sm text-slate-500">لم تقدّم أي طلبات بعد. يمكنك رفع طلب إنهاء خدمة أو نقل من صفحة الموظف.</p> : null}
      {rows.map((r) => (
        <RequestCard key={r.id} r={r}>
          {r.status === 'pending' || r.status === 'postponed' ? <CancelRequestButton id={r.id} /> : null}
        </RequestCard>
      ))}
    </div>
  );
}
