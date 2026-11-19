'use client';
import { useState } from 'react';
import { normalizeSaudiPhone } from '@orgbu/shared';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { toLatinDigits } from '@/lib/phone';
import { toArabicError } from '@/lib/errors';
import { Button, ErrorText, Field, Input } from '@/components/ui';

export function PhoneOtp({ onVerified }: { onVerified: () => void }) {
  const [phone, setPhone] = useState('');
  const [normalized, setNormalized] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeSaudiPhone(toLatinDigits(phone));
    if (!n) return setError('رقم الجوال غير صحيح');
    setBusy(true);
    setError(null);
    const { error: err } = await createBrowserSupabase().auth.signInWithOtp({ phone: n });
    setBusy(false);
    if (err) return setError(toArabicError(err));
    setNormalized(n);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createBrowserSupabase().auth.verifyOtp({ phone: normalized, token: toLatinDigits(code), type: 'sms' });
    setBusy(false);
    if (err) return setError('الكود غير صحيح أو انتهت صلاحيته');
    onVerified();
  }

  if (!normalized) {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <Field label="رقم الجوال">
          <Input inputMode="tel" dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">إرسال كود التحقق</Button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm text-slate-600">أرسلنا كودًا من 6 أرقام إلى <span dir="ltr">{normalized}</span></p>
      <Field label="كود التحقق">
        <Input inputMode="numeric" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={busy} className="w-full">تأكيد</Button>
      <button type="button" className="w-full text-sm text-teal-700" onClick={() => setNormalized(null)}>تغيير الرقم</button>
    </form>
  );
}
