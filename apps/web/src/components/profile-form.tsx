'use client';
import { useState } from 'react';
import { z } from 'zod';
import { identitySchema, messageFor } from '@orgbu/shared';
import type { Result } from '@/lib/errors';
import { identityFieldsFor, NATIONALITIES } from '@/lib/identity-form';
import { toLatinDigits } from '@/lib/phone';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export type ProfileInput = {
  full_name: string; birth_date: string; gender: 'male' | 'female'; email: string; nationality: string;
  identity_type: 'national_id' | 'iqama' | 'border_number'; identity_number: string; iqama_expiry: string | null; entry_date: string | null;
};

const base = z.object({
  full_name: z.string().trim().min(3).max(120),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
    const years = (Date.now() - new Date(d).getTime()) / (365.25 * 86_400_000);
    return years >= 15 && years <= 80;
  }),
  email: z.string().trim().toLowerCase().email(),
});

export function ProfileForm({ action }: { action: (p: ProfileInput) => Promise<Result<string>> }) {
  const [f, setF] = useState({ full_name: '', birth_date: '', gender: 'male' as 'male' | 'female', email: '', nationality: 'SA', other: '', foreignType: 'iqama' as 'iqama' | 'border_number', number: '', iqama_expiry: '', entry_date: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nationality = f.nationality === 'OTHER' ? f.other.toUpperCase() : f.nationality;
  const fields = identityFieldsFor(nationality, nationality === 'SA' ? null : f.foreignType);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const identity_type = nationality === 'SA' ? 'national_id' : f.foreignType;
    const input: ProfileInput = {
      full_name: f.full_name, birth_date: f.birth_date, gender: f.gender, email: f.email, nationality,
      identity_type, identity_number: toLatinDigits(f.number.trim()),
      iqama_expiry: fields.showIqamaExpiry ? f.iqama_expiry || null : null,
      entry_date: fields.showEntryDate ? f.entry_date || null : null,
    };
    const ok = base.safeParse(input).success && identitySchema.safeParse({ ...input, iqama_expiry: input.iqama_expiry ?? undefined, entry_date: input.entry_date ?? undefined }).success;
    if (!ok) return setError(messageFor('ORG_VALIDATION'));
    setError(null);
    setBusy(true);
    const r = await action(input);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="الاسم الكامل"><Input aria-label="الاسم الكامل" value={f.full_name} onChange={set('full_name')} /></Field>
      <Field label="تاريخ الميلاد"><Input aria-label="تاريخ الميلاد" type="date" value={f.birth_date} onChange={set('birth_date')} /></Field>
      <Field label="النوع">
        <select className="w-full rounded-lg border p-2 text-sm" value={f.gender} onChange={set('gender')}>
          <option value="male">ذكر</option><option value="female">أنثى</option>
        </select>
      </Field>
      <Field label="البريد الإلكتروني"><Input aria-label="البريد الإلكتروني" type="email" dir="ltr" value={f.email} onChange={set('email')} /></Field>
      <Field label="الجنسية">
        <select className="w-full rounded-lg border p-2 text-sm" value={f.nationality} onChange={set('nationality')}>
          {NATIONALITIES.map((n) => <option key={n.code} value={n.code}>{n.name}</option>)}
          <option value="OTHER">أخرى</option>
        </select>
      </Field>
      {f.nationality === 'OTHER' ? <Field label="رمز الدولة (حرفان)"><Input dir="ltr" maxLength={2} value={f.other} onChange={set('other')} /></Field> : null}
      {nationality !== 'SA' ? (
        <Field label="نوع الوثيقة">
          <select className="w-full rounded-lg border p-2 text-sm" value={f.foreignType} onChange={set('foreignType')}>
            <option value="iqama">إقامة (مقيم)</option>
            <option value="border_number">رقم حدود (مستقدم جديد)</option>
          </select>
        </Field>
      ) : null}
      <Field label={fields.numberLabel}><Input aria-label={fields.numberLabel} dir="ltr" inputMode="numeric" value={f.number} onChange={set('number')} /></Field>
      {fields.showIqamaExpiry ? <Field label="تاريخ انتهاء الإقامة"><Input type="date" value={f.iqama_expiry} onChange={set('iqama_expiry')} /></Field> : null}
      {fields.showEntryDate ? <Field label="تاريخ الدخول للمملكة"><Input type="date" value={f.entry_date} onChange={set('entry_date')} /></Field> : null}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy} className="w-full">إتمام التسجيل</Button>
    </form>
  );
}
