'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PhoneOtp } from '@/components/phone-otp';
import { Card } from '@/components/ui';

function LoginInner() {
  const next = useSearchParams().get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-teal-800">org BU</h1>
          <p className="text-sm text-slate-500">تسجيل الدخول برقم الجوال</p>
        </div>
        <PhoneOtp onVerified={() => window.location.assign(safeNext)} />
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
