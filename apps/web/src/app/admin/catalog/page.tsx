import { createServerSupabase } from '@/lib/supabase/server';
import { CatalogEditor, type CatalogRow } from '@/components/admin/catalog-editor';

export default async function AdminCatalog() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('department_catalog').select('id, name_ar, name_en, is_fixed').order('is_fixed', { ascending: false }).order('name_ar');
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">قائمة الإدارات</h1>
      <p className="text-sm text-slate-500">الإدارات اللي الشركات بتختار منها وقت التسجيل. الإدارات الثابتة بتتضاف لكل شركة تلقائيًا.</p>
      <CatalogEditor rows={(data ?? []) as CatalogRow[]} />
    </div>
  );
}
