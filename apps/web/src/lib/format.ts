export const maskIdentity = (last4: string | null) => (last4 ? `••••••${last4}` : '—');

export function validateContract(start: string | null, end: string | null): boolean {
  return !(start && end && end < start);
}

export const IDENTITY_TYPE_AR: Record<string, string> = { national_id: 'هوية وطنية', iqama: 'إقامة', border_number: 'رقم حدود' };
