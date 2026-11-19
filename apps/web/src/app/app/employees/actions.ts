'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, fail, toArabicError, type Result } from '@/lib/errors';
import { validateContract } from '@/lib/format';

export async function revealIdentity(employeeId: string): Promise<Result<string | null>> {
  const supabase = await createServerSupabase();
  return callRpc<string | null>(supabase, 'get_employee_identity_number', { p_employee: employeeId });
}

export async function updateContract(employeeId: string, start: string | null, end: string | null): Promise<Result<null>> {
  if (!validateContract(start, end)) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('employees').update({ contract_start: start, contract_end: end }).eq('id', employeeId).select('id');
  if (error) return { ok: false, error: toArabicError(error) };
  if (!data?.length) return fail('ORG_FORBIDDEN');
  revalidatePath(`/app/employees/${employeeId}`);
  return { ok: true, data: null };
}
