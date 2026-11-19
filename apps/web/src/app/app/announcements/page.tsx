import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor, toOrgUnit, type UnitRow } from '@/lib/actor';
import { buildTree } from '@/lib/tree';
import { canPublishCompanyWide, publishableUnits } from '@/lib/announcements';
import { PublishForm } from '@/components/publish-form';
import { AnnouncementItem } from '@/components/announcement-item';

type Ann = { id: string; kind: string; title: string; body: string; pinned: boolean; published_at: string };

export default async function AnnouncementsPage() {
  const bundle = (await loadActor())!;
  const supabase = await createServerSupabase();
  const [anns, reads, units] = await Promise.all([
    supabase.from('announcements').select('id, kind, title, body, pinned, published_at').order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(100),
    supabase.from('announcement_reads').select('announcement_id'),
    supabase.from('org_units').select('id, parent_id, type, name, is_fixed, manager_position_id'),
  ]);
  const readIds = new Set(((reads.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
  const tree = buildTree(((units.data ?? []) as UnitRow[]).map(toOrgUnit), []);
  const targets = publishableUnits(tree, bundle.grants, bundle.actor).map((n) => ({ id: n.id, name: n.name }));
  const companyWide = canPublishCompanyWide(bundle.grants);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">الأخبار والقرارات</h1>
      {bundle.writable && (companyWide || targets.length) ? <PublishForm companyWide={companyWide} units={targets} /> : null}
      <div className="space-y-3">
        {((anns.data ?? []) as Ann[]).map((a) => <AnnouncementItem key={a.id} a={a} unread={!readIds.has(a.id)} />)}
        {!anns.data?.length ? <p className="text-sm text-slate-400">لا توجد أخبار بعد.</p> : null}
      </div>
    </div>
  );
}
