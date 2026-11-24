'use client';
import { useState, useTransition } from 'react';
import { cancelRequest } from '@/app/app/requests/actions';
import { Button, ErrorText } from '@/components/ui';

export function CancelRequestButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <div>
      <Button variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await cancelRequest(id); if (!r.ok) setError(r.error); })}>إلغاء الطلب</Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
