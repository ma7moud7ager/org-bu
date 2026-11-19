'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { fail, toArabicError, type Result } from '@/lib/errors';

async function write(fn: (s: Awaited<ReturnType<typeof createServerSupabase>>) => PromiseLike<{ data: unknown; error: unknown }>, path: string): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const { data, error } = await fn(supabase);
  if (error) return { ok: false, error: toArabicError(error) };
  if (Array.isArray(data) && data.length === 0) return fail('ORG_FORBIDDEN');
  revalidatePath(path);
  return { ok: true, data: null };
}

export async function setSubscription(companyId: string, v: { status: string; planId: string | null; endsAt: string | null }) {
  if (!['trial', 'active', 'expired', 'cancelled'].includes(v.status)) return fail('ORG_VALIDATION');
  return write((s) => s.from('subscriptions').update({ status: v.status, plan_id: v.planId, ends_at: v.endsAt }).eq('company_id', companyId).select('id'), '/admin/companies');
}

export async function setCompanyStatus(companyId: string, status: 'active' | 'suspended') {
  return write((s) => s.from('companies').update({ status }).eq('id', companyId).select('id'), '/admin/companies');
}

export async function upsertPlan(p: { id?: string; name: string; price_monthly: number; price_yearly: number; max_employees: number; is_active: boolean }) {
  if (p.name.trim().length < 2 || p.price_monthly < 0 || p.price_yearly < 0 || p.max_employees < 1) return fail('ORG_VALIDATION');
  const row = { name: p.name.trim(), price_monthly: p.price_monthly, price_yearly: p.price_yearly, max_employees: p.max_employees, is_active: p.is_active };
  return write((s) => (p.id ? s.from('plans').update(row).eq('id', p.id).select('id') : s.from('plans').insert(row).select('id')), '/admin/plans');
}

export async function addCatalog(nameAr: string, nameEn: string) {
  if (nameAr.trim().length < 2 || nameEn.trim().length < 2) return fail('ORG_VALIDATION');
  return write((s) => s.from('department_catalog').insert({ name_ar: nameAr.trim(), name_en: nameEn.trim() }).select('id'), '/admin/catalog');
}

export async function removeCatalog(id: string) {
  return write((s) => s.from('department_catalog').delete().eq('id', id).eq('is_fixed', false).select('id'), '/admin/catalog');
}
