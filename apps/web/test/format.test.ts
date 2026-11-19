import { describe, it, expect } from 'vitest';
import { maskIdentity, validateContract } from '@/lib/format';

describe('maskIdentity', () => {
  it('masks all but last 4', () => expect(maskIdentity('6789')).toBe('••••••6789'));
  it('shows a dash when missing', () => expect(maskIdentity(null)).toBe('—'));
});

describe('validateContract', () => {
  it('rejects end before start', () => expect(validateContract('2026-05-01', '2026-01-01')).toBe(false));
  it('accepts open-ended and ordered dates', () => {
    expect(validateContract('2026-01-01', null)).toBe(true);
    expect(validateContract('2026-01-01', '2027-01-01')).toBe(true);
    expect(validateContract(null, null)).toBe(true);
  });
});

import { subscriptionBadge } from '@/lib/format';

describe('subscriptionBadge', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  it('trial', () => expect(subscriptionBadge('trial', null, now)).toEqual({ label: 'تجريبي', tone: 'amber' }));
  it('active', () => expect(subscriptionBadge('active', '2026-12-01T00:00:00Z', now)).toEqual({ label: 'نشط', tone: 'green' }));
  it('active but past end date', () => expect(subscriptionBadge('active', '2026-05-01T00:00:00Z', now)).toEqual({ label: 'منتهي', tone: 'red' }));
  it('expired', () => expect(subscriptionBadge('expired', null, now)).toEqual({ label: 'منتهي', tone: 'red' }));
  it('cancelled', () => expect(subscriptionBadge('cancelled', null, now)).toEqual({ label: 'ملغي', tone: 'gray' }));
});
