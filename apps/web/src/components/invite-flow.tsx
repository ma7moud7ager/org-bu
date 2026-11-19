'use client';
import { useState } from 'react';
import { PhoneOtp } from '@/components/phone-otp';
import { ProfileForm } from '@/components/profile-form';
import { acceptInvite } from '@/app/invite/[token]/actions';

export function InviteFlow({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [verified, setVerified] = useState(signedIn);
  if (!verified) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">سجّل الدخول برقم جوالك أولًا. سيكون هذا الرقم هو وسيلة دخولك للمنصة.</p>
        <PhoneOtp onVerified={() => setVerified(true)} />
      </div>
    );
  }
  return <ProfileForm action={(p) => acceptInvite(token, p)} />;
}
