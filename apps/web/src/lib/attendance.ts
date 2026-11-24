import { ATTENDANCE_REASON_AR } from '@orgbu/shared';

export type Punch = { kind: 'in' | 'out'; at: string };

export function attendanceSummary(records: Punch[]): { firstIn: string | null; lastOut: string | null; workedMinutes: number; open: boolean } {
  const sorted = [...records].sort((a, b) => a.at.localeCompare(b.at));
  let worked = 0;
  let openAt: string | null = null;
  for (const r of sorted) {
    if (r.kind === 'in') openAt = r.at;
    else if (openAt) {
      worked += (Date.parse(r.at) - Date.parse(openAt)) / 60_000;
      openAt = null;
    }
  }
  return {
    firstIn: sorted.find((r) => r.kind === 'in')?.at ?? null,
    lastOut: [...sorted].reverse().find((r) => r.kind === 'out')?.at ?? null,
    workedMinutes: Math.round(worked),
    open: openAt !== null,
  };
}

export function riyadhTime(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export type AttendanceResult = { result: 'accepted' | 'rejected'; kind: 'in' | 'out'; reason?: string | null; distance_m?: number | null };

export function attendanceStatusText(r: AttendanceResult): string {
  if (r.result === 'accepted') return r.kind === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف';
  const base = `تم رفض التسجيل: ${ATTENDANCE_REASON_AR[r.reason ?? ''] ?? ''}`;
  return r.reason === 'outside' && r.distance_m != null ? `${base} (تبعد ${Math.round(r.distance_m)} متر)` : base;
}

export const reasonText = (reason: string | null) => (reason ? ATTENDANCE_REASON_AR[reason] ?? reason : '');
