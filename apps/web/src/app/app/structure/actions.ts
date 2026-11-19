'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, fail, toArabicError, type Result } from '@/lib/errors';

const done = <T>(r: Result<T>): Result<T> => {
  if (r.ok) revalidatePath('/app/structure');
  return r;
};

export async function createUnit(parentId: string, type: string, name: string): Promise<Result<string>> {
  if (name.trim().length < 2) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  return done(await callRpc<string>(supabase, 'create_org_unit', { p_parent: parentId, p_type: type, p_name: name.trim() }));
}

async function updateUnit(id: string, patch: Record<string, unknown>): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('org_units').update(patch).eq('id', id).select('id');
  if (error) return { ok: false, error: toArabicError(error) };
  if (!data?.length) return fail('ORG_FORBIDDEN');
  return done({ ok: true, data: null });
}

export async function renameUnit(id: string, name: string): Promise<Result<null>> {
  if (name.trim().length < 2) return fail('ORG_VALIDATION');
  return updateUnit(id, { name: name.trim() });
}

export async function moveUnit(id: string, newParentId: string): Promise<Result<null>> {
  return updateUnit(id, { parent_id: newParentId });
}

export async function deleteUnit(id: string, replacementId: string | null): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  return done(await callRpc<null>(supabase, 'delete_org_unit', { p_unit: id, p_replacement: replacementId }));
}

export async function createPosition(unitId: string, title: string, roleId: string, isManager: boolean): Promise<Result<string>> {
  if (title.trim().length < 2 || !roleId) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const { data: company } = await supabase.rpc('current_company_id');
  const { data, error } = await supabase
    .from('positions')
    .insert({ company_id: company, org_unit_id: unitId, title: title.trim(), role_id: roleId, is_manager: isManager })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: toArabicError(error) };
  if (isManager) {
    const r = await updateUnit(unitId, { manager_position_id: data.id });
    if (!r.ok) return r;
  }
  return done({ ok: true, data: data.id as string });
}

export async function createInvite(positionId: string, sentTo: string): Promise<Result<string>> {
  const supabase = await createServerSupabase();
  return callRpc<string>(supabase, 'create_invitation', { p_position: positionId, p_sent_to: sentTo || null, p_ttl_days: 7 });
}
