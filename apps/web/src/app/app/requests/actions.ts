'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, type Result } from '@/lib/errors';

export async function decideRequest(id: string, decision: 'approve' | 'reject' | 'postpone', note: string,
                                    payload: Record<string, unknown> | null, until: string | null): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'decide_request', {
    p_request: id, p_decision: decision, p_note: note || null, p_payload: payload, p_postpone_until: until,
  });
  if (r.ok) { revalidatePath('/app/requests'); revalidatePath('/app/employees'); }
  return r;
}

export async function cancelRequest(id: string): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'cancel_request', { p_request: id });
  if (r.ok) revalidatePath('/app/requests/mine');
  return r;
}
