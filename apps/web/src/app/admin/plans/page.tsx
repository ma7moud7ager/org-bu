import { createServerSupabase } from '@/lib/supabase/server';
import { PlansEditor, type PlanRow } from '@/components/admin/plans-editor';

export default async function AdminPlans() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('plans').select('id, name, price_monthly, price_yearly, max_employees, is_active').order('price_monthly');
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">الباقات والأسعار</h1>
      <PlansEditor plans={(data ?? []) as PlanRow[]} />
    </div>
  );
}
