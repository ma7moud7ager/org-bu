import { redirect } from 'next/navigation';
import type { Grant } from '@orgbu/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor } from '@/lib/actor';
import { hasGrant } from '@/lib/actor-types';
import { RoleMatrix } from '@/components/role-matrix';

export default async function RolesPage() {
  const bundle = (await loadActor())!;
  if (!hasGrant(bundle.grants, 'roles.manage')) redirect('/app');
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('roles').select('id, name, system_key, role_permissions(permission, scope)').order('created_at');
  const roles = (data ?? []) as unknown as Array<{ id: string; name: string; system_key: string | null; role_permissions: Grant[] }>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الأدوار والصلاحيات</h1>
      <RoleMatrix roles={roles} writable={bundle.writable} />
    </div>
  );
}
