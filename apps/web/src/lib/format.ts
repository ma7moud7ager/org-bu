export const maskIdentity = (last4: string | null) => (last4 ? `••••••${last4}` : '—');

export function validateContract(start: string | null, end: string | null): boolean {
  return !(start && end && end < start);
}

export const IDENTITY_TYPE_AR: Record<string, string> = { national_id: 'هوية وطنية', iqama: 'إقامة', border_number: 'رقم حدود' };

export type Badge = { label: string; tone: 'green' | 'amber' | 'red' | 'gray' };

export function subscriptionBadge(status: string, endsAt: string | null, now = new Date()): Badge {
  const past = endsAt !== null && new Date(endsAt) < now;
  if (status === 'cancelled') return { label: 'ملغي', tone: 'gray' };
  if (status === 'expired' || past) return { label: 'منتهي', tone: 'red' };
  if (status === 'trial') return { label: 'تجريبي', tone: 'amber' };
  return { label: 'نشط', tone: 'green' };
}
