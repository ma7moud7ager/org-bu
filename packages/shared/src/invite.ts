import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteExpiry(from: Date, days = INVITE_TTL_DAYS): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
