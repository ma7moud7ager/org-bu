import { describe, it, expect } from 'vitest';
import { generateInviteToken, hashInviteToken, inviteExpiry, INVITE_TTL_DAYS } from '../src/invite';

describe('invite tokens', () => {
  it('token is 43-char base64url', () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateInviteToken()).not.toBe(t);
  });
  it('hash is sha256 hex', () => {
    expect(hashInviteToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('expiry defaults to 7 days', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    expect(INVITE_TTL_DAYS).toBe(7);
    expect(inviteExpiry(from).toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });
});
