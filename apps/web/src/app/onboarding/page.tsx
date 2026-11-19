import { createServerSupabase } from '@/lib/supabase/server';
import { OnboardingForm, type CatalogItem } from '@/components/onboarding-form';
import { registerCompany } from './actions';

export default async function OnboardingPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('department_catalog').select('id, name_ar, is_fixed').order('is_fixed', { ascending: false }).order('name_ar');
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-teal-800">سجّل شركتك</h1>
        <p className="text-sm text-slate-500">فترة تجريبية مجانية لمدة 14 يومًا.</p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        هل أنت موظف في شركة مسجلة على المنصة؟ لا تسجّل شركة جديدة. اطلب من مديرك أو من الموارد البشرية رابط دعوة وافتحه للانضمام إلى شركتك.
      </div>
      <OnboardingForm catalog={(data ?? []) as CatalogItem[]} action={registerCompany} />
    </main>
  );
}
