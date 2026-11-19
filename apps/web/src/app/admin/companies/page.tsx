import { createServerSupabase } from '@/lib/supabase/server';
import { CompaniesTable, type CompanyRow, type PlanOption } from '@/components/admin/companies-table';

export default async function AdminCompanies() {
  const supabase = await createServerSupabase();
  const [overview, plans] = await Promise.all([supabase.rpc('admin_company_overview'), supabase.from('plans').select('id, name')]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الشركات المشتركة</h1>
      <CompaniesTable rows={(overview.data ?? []) as CompanyRow[]} plans={(plans.data ?? []) as PlanOption[]} />
    </div>
  );
}
