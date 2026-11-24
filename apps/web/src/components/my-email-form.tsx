'use client';
import { useState, useTransition } from 'react';
import { updateMyEmail } from '@/app/app/me/actions';
import { Button, ErrorText, Input } from '@/components/ui';

export function MyEmailForm({ email }: { email: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  if (!editing) {
    return <span className="flex items-center gap-2"><span dir="ltr">{email ?? '—'}</span><button className="text-xs text-teal-700" onClick={() => setEditing(true)}>تعديل</button></span>;
  }
  return (
    <span className="flex flex-col gap-2">
      <Input type="email" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <span className="flex gap-2">
        <Button disabled={pending} onClick={() => run(async () => { const r = await updateMyEmail(value); if (r.ok) setEditing(false); else setError(r.error); })}>حفظ</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>إلغاء</Button>
      </span>
    </span>
  );
}
