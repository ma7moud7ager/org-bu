'use server';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, fail, type Result } from '@/lib/errors';
import type { OnboardingInput } from '@/components/onboarding-form';

export async function registerCompany(input: OnboardingInput): Promise<Result<string>> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const phone = data.user?.phone;
  if (!phone) return fail('ORG_FORBIDDEN');
  const res = await callRpc<string>(supabase, 'register_company', {
    p_legal_name: input.legal_name,
    p_cr_number: input.cr_number,
    p_employee_count: input.employee_count,
    p_activity_type: input.activity_type,
    p_selected_catalog_ids: input.catalog_ids,
    p_admin_full_name: input.admin_full_name,
    p_admin_phone: phone.startsWith('+') ? phone : `+${phone}`,
    p_admin_email: input.admin_email,
  });
  if (!res.ok) return res;
  redirect('/app/structure');
}
