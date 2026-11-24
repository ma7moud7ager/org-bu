'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, type Result } from '@/lib/errors';

export async function updateMyDocument(type: string, number: string, iqamaExpiry: string | null, entryDate: string | null): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'update_my_document', {
    p_identity_type: type, p_number: number, p_iqama_expiry: iqamaExpiry, p_entry_date: entryDate,
  });
  if (r.ok) revalidatePath('/app/me');
  return r;
}

export async function updateMyEmail(email: string): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'update_my_email', { p_email: email });
  if (r.ok) revalidatePath('/app/me');
  return r;
}
