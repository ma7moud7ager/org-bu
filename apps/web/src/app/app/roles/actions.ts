'use server';
import { revalidatePath } from 'next/cache';
import type { Grant } from '@orgbu/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { fail, toArabicError, type Result } from '@/lib/errors';
import { diffGrants } from '@/lib/role-matrix';

export async function createRole(name: string): Promise<Result<string>> {
  if (name.trim().length < 2) return fail('ORG_VALIDATION');
  const supabase = await createServerSupabase();
  const { data: company } = await supabase.rpc('current_company_id');
  const { data, error } = await supabase.from('roles').insert({ company_id: company, name: name.trim() }).select('id').single();
  if (error || !data) return { ok: false, error: toArabicError(error) };
  revalidatePath('/app/roles');
  return { ok: true, data: data.id as string };
}

export async function saveGrants(roleId: string, before: Grant[], after: Grant[]): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const { add, remove } = diffGrants(before, after);
  for (const g of remove) {
    const { error } = await supabase.from('role_permissions').delete().match({ role_id: roleId, permission: g.permission, scope: g.scope });
    if (error) return { ok: false, error: toArabicError(error) };
  }
  if (add.length) {
    const { error } = await supabase.from('role_permissions').insert(add.map((g) => ({ role_id: roleId, ...g })));
    if (error) return { ok: false, error: toArabicError(error) };
  }
  revalidatePath('/app/roles');
  return { ok: true, data: null };
}
