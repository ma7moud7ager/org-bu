'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, fail, type Result } from '@/lib/errors';
import { validateContract } from '@/lib/format';
import type { Mode, TransferPayload } from '@/lib/employee-actions';

const refresh = (id: string) => {
  revalidatePath(`/app/employees/${id}`);
  revalidatePath('/app/employees');
};

export async function revealIdentity(employeeId: string): Promise<Result<string | null>> {
  const supabase = await createServerSupabase();
  return callRpc<string | null>(supabase, 'get_employee_identity_number', { p_employee: employeeId });
}

export type ProfilePatch = {
  full_name: string; birth_date: string | null; gender: string | null; nationality: string | null; email: string | null;
  contract_start: string | null; contract_end: string | null;
};

export async function updateProfile(employeeId: string, p: ProfilePatch): Promise<Result<null>> {
  if (!validateContract(p.contract_start, p.contract_end)) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'update_employee_profile', {
    p_employee: employeeId, p_full_name: p.full_name, p_birth_date: p.birth_date, p_gender: p.gender,
    p_nationality: p.nationality, p_email: p.email, p_contract_start: p.contract_start, p_contract_end: p.contract_end,
  });
  if (r.ok) refresh(employeeId);
  return r;
}

export type TerminationInput = { reason: string; note: string; lastDay: string };

export async function terminate(mode: Mode, employeeId: string, t: TerminationInput): Promise<Result<null>> {
  if (!mode || !t.lastDay || !t.reason) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const r = mode === 'direct'
    ? await callRpc<null>(supabase, 'terminate_employee', { p_employee: employeeId, p_reason: t.reason, p_note: t.note, p_last_day: t.lastDay })
    : await callRpc<null>(supabase, 'submit_request', {
        p_type: 'termination', p_subject: employeeId, p_payload: { reason: t.reason, note: t.note, last_day: t.lastDay },
      });
  if (r.ok) { refresh(employeeId); revalidatePath('/app/requests/mine'); }
  return r.ok ? { ok: true, data: null } : r;
}

export async function transfer(mode: Mode, employeeId: string, p: TransferPayload | null): Promise<Result<null>> {
  if (!mode || !p) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const r = mode === 'direct'
    ? await callRpc<string | null>(supabase, 'transfer_employee', {
        p_employee: employeeId,
        p_target_position: 'target_position' in p ? p.target_position : null,
        p_new_unit: 'new_unit' in p ? p.new_unit : null,
        p_new_title: 'new_title' in p ? p.new_title : null,
        p_new_role: 'new_role' in p ? p.new_role : null,
        p_run_at: p.run_at,
      })
    : await callRpc<string>(supabase, 'submit_request', { p_type: 'transfer', p_subject: employeeId, p_payload: p });
  if (r.ok) { refresh(employeeId); revalidatePath('/app/structure'); revalidatePath('/app/requests/mine'); }
  return r.ok ? { ok: true, data: null } : r;
}

export async function cancelScheduled(employeeId: string, actionId: string): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'cancel_scheduled_action', { p_action: actionId });
  if (r.ok) refresh(employeeId);
  return r;
}
