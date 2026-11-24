import { describe, it, expect } from 'vitest';
import { daysUntil, expiryTone, riyadhToday } from '@/lib/dates';

describe('dates', () => {
  const now = new Date('2026-11-24T22:30:00Z'); // already 25 Nov in Riyadh
  it('riyadhToday uses the Riyadh calendar date', () => expect(riyadhToday(now)).toBe('2026-11-25'));
  it('daysUntil counts calendar days from Riyadh today', () => {
    expect(daysUntil('2026-11-25', now)).toBe(0);
    expect(daysUntil('2026-12-25', now)).toBe(30);
    expect(daysUntil('2026-11-20', now)).toBe(-5);
  });
  it('expiryTone: red under 30 days, amber under 90, else green', () => {
    expect(expiryTone(-1)).toBe('red');
    expect(expiryTone(29)).toBe('red');
    expect(expiryTone(30)).toBe('amber');
    expect(expiryTone(89)).toBe('amber');
    expect(expiryTone(90)).toBe('green');
  });
});
