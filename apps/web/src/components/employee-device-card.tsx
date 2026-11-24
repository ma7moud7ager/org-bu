'use client';
import { useState, useTransition } from 'react';
import { unbindDevice } from '@/app/app/attendance/actions';
import { Button, Card, ErrorText } from '@/components/ui';

export type EmployeeDevice = { status: 'none' | 'active'; model?: string | null; bound_at?: string; pending_change: boolean };

export function EmployeeDeviceCard({ employeeId, device, canUnbind }: { employeeId: string; device: EmployeeDevice; canUnbind: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-bold">الجوال المربوط</h2>
      {device.status === 'active'
        ? <p>{device.model ?? 'جوال'} — منذ {device.bound_at?.slice(0, 10)}</p>
        : <p className="text-slate-500">لا يوجد جوال مربوط. أول جوال يدخل منه الموظف سيُربط تلقائيًا.</p>}
      {device.pending_change ? <p className="text-amber-700">يوجد طلب تغيير جوال في الطلبات الواردة.</p> : null}
      <ErrorText>{error}</ErrorText>
      {canUnbind && device.status === 'active' ? (
        <Button variant="ghost" disabled={pending} onClick={() => run(async () => { const r = await unbindDevice(employeeId); if (!r.ok) setError(r.error); })}>فك الربط</Button>
      ) : null}
    </Card>
  );
}
