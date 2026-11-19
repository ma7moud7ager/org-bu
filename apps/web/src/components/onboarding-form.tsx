'use client';
import { useState } from 'react';
import { z } from 'zod';
import { companyRegistrationSchema, messageFor } from '@orgbu/shared';
import type { Result } from '@/lib/errors';
import { Button, Card, ErrorText, Field, Input } from '@/components/ui';

export type CatalogItem = { id: string; name_ar: string; is_fixed: boolean };
export type OnboardingInput = z.infer<typeof companyRegistrationSchema> & {
  catalog_ids: string[];
  admin_full_name: string;
  admin_email: string;
};

const schema = companyRegistrationSchema.extend({
  admin_full_name: z.string().trim().min(3).max(120),
  admin_email: z.string().trim().toLowerCase().email(),
});

const ACTIVITIES = [
  { value: 'commercial', label: 'تجاري', hint: 'بيع منتجات، فروع ومخزون' },
  { value: 'service', label: 'خدمي', hint: 'تقديم خدمات، إدارات وفرق' },
  { value: 'mixed', label: 'مختلط', hint: 'منتجات وخدمات معًا' },
] as const;

export function OnboardingForm({ catalog, action }: { catalog: CatalogItem[]; action: (input: OnboardingInput) => Promise<Result<string>> }) {
  const [form, setForm] = useState({ legal_name: '', cr_number: '', employee_count: '', activity_type: 'commercial', admin_full_name: '', admin_email: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, employee_count: Number(form.employee_count) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = messageFor('ORG_VALIDATION');
      return setFieldErrors(errs);
    }
    setFieldErrors({});
    setBusy(true);
    const res = await action({ ...parsed.data, catalog_ids: selected });
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">بيانات الشركة</h2>
        <Field label="الاسم القانوني للشركة" error={fieldErrors.legal_name}><Input id="legal_name" aria-label="الاسم القانوني للشركة" value={form.legal_name} onChange={set('legal_name')} /></Field>
        <Field label="رقم السجل التجاري" error={fieldErrors.cr_number}><Input aria-label="رقم السجل التجاري" dir="ltr" inputMode="numeric" value={form.cr_number} onChange={set('cr_number')} /></Field>
        <Field label="عدد الموظفين" error={fieldErrors.employee_count}><Input aria-label="عدد الموظفين" type="number" min={1} value={form.employee_count} onChange={set('employee_count')} /></Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">نوع النشاط</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ACTIVITIES.map((a) => (
              <label key={a.value} className={`cursor-pointer rounded-lg border p-3 ${form.activity_type === a.value ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}`}>
                <input type="radio" name="activity" className="sr-only" checked={form.activity_type === a.value} onChange={() => setForm({ ...form, activity_type: a.value })} />
                <span className="block font-medium">{a.label}</span>
                <span className="block text-xs text-slate-500">{a.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">الإدارات</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {catalog.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.is_fixed || selected.includes(c.id)}
                disabled={c.is_fixed}
                onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
              />
              {c.name_ar}
              {c.is_fixed ? <span className="text-xs text-slate-400">إدارة ثابتة</span> : null}
            </label>
          ))}
        </div>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">مدير الحساب</h2>
        <Field label="اسمك الكامل" error={fieldErrors.admin_full_name}><Input aria-label="اسمك الكامل" value={form.admin_full_name} onChange={set('admin_full_name')} /></Field>
        <Field label="البريد الإلكتروني" error={fieldErrors.admin_email}><Input aria-label="البريد الإلكتروني" type="email" dir="ltr" value={form.admin_email} onChange={set('admin_email')} /></Field>
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy} className="w-full">تسجيل الشركة</Button>
    </form>
  );
}
