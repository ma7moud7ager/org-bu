'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, fail, type Result } from '@/lib/errors';

export async function publish(kind: 'news' | 'decision', title: string, body: string, audience: string[] | null, pinned: boolean): Promise<Result<string>> {
  if (title.trim().length < 2 || !body.trim()) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const r = await callRpc<string>(supabase, 'publish_announcement', { p_kind: kind, p_title: title, p_body: body, p_audience: audience, p_pinned: pinned });
  if (r.ok) revalidatePath('/app/announcements');
  return r;
}

export async function markRead(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.rpc('mark_announcement_read', { p_announcement: id });
}
