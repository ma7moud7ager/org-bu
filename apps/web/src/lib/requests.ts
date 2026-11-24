import { reasonLabel } from './employee-actions';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'postponed' | 'cancelled';
export type Badge = { label: string; tone: 'amber' | 'green' | 'red' | 'slate' };

const BADGES: Record<RequestStatus, Badge> = {
  pending: { label: 'قيد المراجعة', tone: 'amber' },
  approved: { label: 'تمت الموافقة', tone: 'green' },
  rejected: { label: 'مرفوض', tone: 'red' },
  postponed: { label: 'مؤجل', tone: 'slate' },
  cancelled: { label: 'ملغي', tone: 'slate' },
};

export const requestStatusBadge = (s: string): Badge => BADGES[s as RequestStatus] ?? { label: s, tone: 'slate' };

export const TONE_CLASSES: Record<Badge['tone'], string> = {
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  slate: 'bg-slate-100 text-slate-700',
};

export const REQUEST_TYPE_AR: Record<string, string> = { termination: 'إنهاء خدمة', transfer: 'نقل' };

type Payload = Record<string, unknown>;

/** One line describing the request; positionLabels maps position id → "title — unit". */
export function requestSummary(r: { type: string; payload: Payload }, positionLabels: Record<string, string> = {}): string {
  const p = r.payload;
  if (r.type === 'termination') return `إنهاء خدمة — ${reasonLabel(p.reason as string)} — آخر يوم عمل ${p.last_day as string}`;
  const when = p.run_at ? `بتاريخ ${p.run_at as string}` : 'فوري';
  const dest = p.target_position
    ? positionLabels[p.target_position as string] ?? 'منصب شاغر'
    : `منصب جديد: ${p.new_title as string}`;
  return `نقل إلى ${dest} — ${when}`;
}
