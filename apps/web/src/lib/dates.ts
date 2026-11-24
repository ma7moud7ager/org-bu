const DAY_MS = 86_400_000;

/** Today's calendar date in Riyadh as YYYY-MM-DD. */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Calendar days from Riyadh today until `date` (YYYY-MM-DD); negative when past. */
export function daysUntil(date: string, now: Date = new Date()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${riyadhToday(now)}T00:00:00Z`)) / DAY_MS);
}

export type Tone = 'red' | 'amber' | 'green';

export function expiryTone(days: number): Tone {
  if (days < 30) return 'red';
  if (days < 90) return 'amber';
  return 'green';
}
