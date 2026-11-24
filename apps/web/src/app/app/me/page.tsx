import type { ReactNode } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { requestStatusBadge, TONE_CLASSES, REQUEST_TYPE_AR } from '@/lib/requests';
import { Card } from '@/components/ui';
import { Countdown, DocumentCard, type MyDocument } from '@/components/document-card';
import { MyEmailForm } from '@/components/my-email-form';

type Profile = {
  me: MyDocument & { id: string; full_name: string; phone: string; email: string | null; birth_date: string | null; contract_start: string | null; contract_end: string | null };
  company: { name: string };
  job: { title: string; unit_name: string; branch_name: string | null; role_name: string } | null;
  manager: { name: string; title: string; phone?: string } | null;
  requests: Array<{ id: string; type: string; status: string; subject_name: string; created_at: string }>;
};

const Row = ({ k, v }: { k: string; v: ReactNode }) => <div><dt className="text-slate-400">{k}</dt><dd>{v ?? '—'}</dd></div>;

export default async function MePage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('my_profile');
  const p = data as Profile | null;
  if (!p) return null;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">بياناتي</h1>
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row k="الاسم" v={p.me.full_name} />
          <Row k="الجوال" v={<span dir="ltr">{p.me.phone}</span>} />
          <Row k="البريد" v={<MyEmailForm email={p.me.email} />} />
          <Row k="تاريخ الميلاد" v={p.me.birth_date} />
          <Row k="الجنسية" v={p.me.nationality} />
        </dl>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">وظيفتي</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row k="الشركة" v={p.company.name} />
          <Row k="المنصب" v={p.job?.title} />
          <Row k="الوحدة" v={p.job?.unit_name} />
          <Row k="الفرع" v={p.job?.branch_name} />
          <Row k="الدور" v={p.job?.role_name} />
        </dl>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-bold">مديري المباشر</h2>
        {p.manager ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row k="الاسم" v={p.manager.name} />
            <Row k="المنصب" v={p.manager.title} />
            {p.manager.phone ? <Row k="الجوال" v={<a dir="ltr" className="text-teal-700" href={`tel:${p.manager.phone}`}>{p.manager.phone}</a>} /> : null}
          </dl>
        ) : <p className="text-sm text-slate-500">لا يوجد مدير مباشر.</p>}
      </Card>
      <DocumentCard doc={p.me} />
      <Card className="space-y-3">
        <h2 className="font-bold">عقدي</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row k="البداية" v={p.me.contract_start} />
          <Row k="النهاية" v={p.me.contract_end ? <span className="flex items-center gap-2">{p.me.contract_end} <Countdown date={p.me.contract_end} /></span> : null} />
        </dl>
      </Card>
      {p.requests.length ? (
        <Card className="space-y-2">
          <h2 className="font-bold">طلباتي</h2>
          <ul className="space-y-1 text-sm">
            {p.requests.map((r) => {
              const b = requestStatusBadge(r.status);
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <span>{REQUEST_TYPE_AR[r.type]} — {r.subject_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASSES[b.tone]}`}>{b.label}</span>
                  <span className="ms-auto text-xs text-slate-400">{r.created_at.slice(0, 10)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
