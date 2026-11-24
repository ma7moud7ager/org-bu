import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor } from '@/lib/actor';
import type { RequestRow } from '@/lib/request-row';
import { RequestCard } from '@/components/request-card';
import { DecideDialog } from '@/components/decide-dialog';

export default async function IncomingRequestsPage() {
  const bundle = (await loadActor())!;
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('request_list', { p_mine: false });
  const rows = (data ?? []) as RequestRow[];
  const open = rows.filter((r) => r.status === 'pending' || r.status === 'postponed');
  const closed = rows.filter((r) => !open.includes(r));
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">الطلبات الواردة <span className="text-sm font-normal text-slate-400">({open.length})</span></h1>
      {open.length === 0 ? <p className="text-sm text-slate-500">لا توجد طلبات بانتظار قرارك.</p> : null}
      {open.map((r) => <RequestCard key={r.id} r={r}>{bundle.writable ? <DecideDialog r={r} /> : null}</RequestCard>)}
      {closed.length ? <h2 className="pt-4 font-bold text-slate-600">السابقة</h2> : null}
      {closed.map((r) => <RequestCard key={r.id} r={r} />)}
    </div>
  );
}
