'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { biometric, currentLocation } from '@/lib/native';
import { attendanceStatusText } from '@/lib/attendance';
import { useNative } from '@/components/native-boot';
import { recordAttendance } from './actions';

export function AttendanceButton({ nextKind, fenceConfigured }: { nextKind: 'in' | 'out'; fenceConfigured: boolean }) {
  const { native, device } = useNative();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  if (!native) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
        تسجيل الحضور والانصراف يتم من تطبيق org BU على جوالك فقط.{' '}
        <Link href="/download" className="text-teal-700">حمّل التطبيق</Link>
      </div>
    );
  }
  const label = nextKind === 'in' ? 'تسجيل حضور' : 'تسجيل انصراف';
  return (
    <div className="space-y-3 text-center">
      {!fenceConfigured ? <p className="text-sm text-amber-700">لم يتم تحديد موقع العمل لوحدتك بعد. تواصل مع الموارد البشرية.</p> : null}
      <button
        disabled={pending || !device}
        onClick={() => run(async () => {
          setMsg(null);
          const ok = await biometric.verify(label);
          const pos = ok ? await currentLocation() : null;
          if (pos && 'error' in pos) {
            setMsg({ ok: false, text: pos.error === 'denied' ? 'اسمح للتطبيق بالوصول للموقع من إعدادات الجوال.' : 'تعذر تحديد موقعك. حاول مرة أخرى.' });
            return;
          }
          const r = await recordAttendance(nextKind, pos, ok, device!.id);
          if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
          setMsg({ ok: r.data.result === 'accepted', text: attendanceStatusText(r.data) });
          router.refresh();
        })}
        className={`h-40 w-40 rounded-full text-xl font-bold text-white shadow-lg disabled:opacity-50 ${nextKind === 'in' ? 'bg-teal-700' : 'bg-slate-700'}`}
      >
        {pending ? '...' : label}
      </button>
      {msg ? <p className={`text-sm ${msg.ok ? 'text-teal-700' : 'text-red-700'}`}>{msg.text}</p> : null}
    </div>
  );
}
