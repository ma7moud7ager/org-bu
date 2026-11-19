'use server';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, type Result } from '@/lib/errors';
import type { ProfileInput } from '@/components/profile-form';

export async function acceptInvite(token: string, p: ProfileInput): Promise<Result<string>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<string>(supabase, 'accept_invitation', {
    p_token: token, p_full_name: p.full_name, p_birth_date: p.birth_date, p_gender: p.gender, p_nationality: p.nationality,
    p_identity_type: p.identity_type, p_identity_number: p.identity_number, p_iqama_expiry: p.iqama_expiry, p_entry_date: p.entry_date,
    p_email: p.email,
  });
  if (!r.ok) return r;
  redirect('/app');
}
