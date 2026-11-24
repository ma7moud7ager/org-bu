import { createServerSupabase } from '@/lib/supabase/server';
import { LogoutButton } from '@/components/logout-button';

export default async function EndedPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('ended_company_name');
  const company = (data as string | null) ?? 'الشركة';
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-teal-800">انتهت خدمتك في {company}</h1>
      <p className="text-sm text-slate-600">
        لم يعد بإمكانك الدخول إلى مساحة عمل الشركة. لأي استفسار تواصل مع الموارد البشرية في شركتك.
      </p>
      <LogoutButton />
    </main>
  );
}
