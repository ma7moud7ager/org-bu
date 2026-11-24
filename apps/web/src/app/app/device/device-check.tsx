'use client';
import { useState } from 'react';
import { biometric, currentLocation, type Position, type PositionError } from '@/lib/native';
import { useNative } from '@/components/native-boot';
import { Button, Card } from '@/components/ui';

export type MyDevice = { status: 'none' | 'active'; device_id?: string; model?: string | null; bound_at?: string; push?: boolean; pending_change: boolean };

const Line = ({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) => (
  <li className="flex items-center gap-2 text-sm">
    <span className={ok === null ? 'text-slate-400' : ok ? 'text-teal-700' : 'text-red-700'}>{ok === null ? '○' : ok ? '✓' : '✗'}</span>
    <span>{label}</span>
    {detail ? <span className="text-slate-500">— {detail}</span> : null}
  </li>
);

export function DeviceCheck({ bound }: { bound: MyDevice }) {
  const { native, device, push } = useNative();
  const [bio, setBio] = useState<boolean | null>(null);
  const [loc, setLoc] = useState<Position | PositionError | null>(null);
  if (!native) return <Card className="text-sm text-slate-600">هذه الصفحة تعمل داخل تطبيق org BU على الجوال فقط.</Card>;
  const sameDevice = bound.status === 'active' && device?.id === bound.device_id;
  return (
    <Card className="space-y-4">
      <ul className="space-y-2">
        <Line ok={sameDevice} label="الجوال مربوط بحسابك"
          detail={bound.status === 'none' ? 'غير مربوط' : sameDevice ? bound.model ?? '' : bound.pending_change ? 'طلب التغيير عند الموارد البشرية' : 'حسابك مربوط بجوال آخر'} />
        <Line ok={push} label="الإشعارات" detail={push ? 'مفعّلة' : 'غير مفعّلة بعد'} />
        <Line ok={bio} label="البصمة / Face ID" detail={bio === null ? 'لم تتم التجربة' : bio ? 'تعمل' : 'لم تنجح'} />
        <Line ok={loc === null ? null : !('error' in loc) && !loc.isMock && loc.accuracy <= 100} label="الموقع"
          detail={loc === null ? 'لم تتم التجربة' : 'error' in loc ? (loc.error === 'denied' ? 'الإذن مرفوض' : 'غير متاح') : loc.isMock ? 'موقع مزيف!' : `دقة ${Math.round(loc.accuracy)} متر`} />
      </ul>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={async () => setBio(await biometric.verify('تجربة البصمة'))}>جرّب البصمة</Button>
        <Button variant="ghost" onClick={async () => setLoc(await currentLocation())}>جرّب الموقع</Button>
      </div>
    </Card>
  );
}
