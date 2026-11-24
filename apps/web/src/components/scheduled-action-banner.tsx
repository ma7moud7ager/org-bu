'use client';
import { useState, useTransition } from 'react';
import { cancelScheduled } from '@/app/app/employees/actions';
import { Button, ErrorText } from '@/components/ui';

export function ScheduledActionBanner({ employeeId, actionId, text, canCancel }: { employeeId: string; actionId: string; text: string; canCancel: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <span className="flex-1">{text}</span>
      {canCancel ? (
        <Button variant="ghost" disabled={pending} onClick={() => run(async () => {
          const r = await cancelScheduled(employeeId, actionId);
          if (!r.ok) setError(r.error);
        })}>تراجع</Button>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
