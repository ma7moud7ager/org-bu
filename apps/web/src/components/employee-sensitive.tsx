'use client';
import { useState, useTransition } from 'react';
import { revealIdentity } from '@/app/app/employees/actions';
import { Button, ErrorText } from '@/components/ui';

export function EmployeeSensitive({ employeeId }: { employeeId: string }) {
  const [number, setNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        {number ? <span dir="ltr" className="font-mono">{number}</span> : (
          <Button variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await revealIdentity(employeeId); if (r.ok) setNumber(r.data ?? '—'); else setError(r.error); })}>إظهار رقم الوثيقة</Button>
        )}
        <span className="text-xs text-slate-400">يتم تسجيل كل عملية إظهار</span>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
