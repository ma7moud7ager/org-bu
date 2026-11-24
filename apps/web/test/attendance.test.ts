import { describe, it, expect } from 'vitest';
import { attendanceSummary, riyadhTime, attendanceStatusText } from '@/lib/attendance';

describe('attendanceSummary', () => {
  it('first in, last out and worked minutes from accepted pairs', () => {
    const s = attendanceSummary([
      { kind: 'in', at: '2026-11-24T05:00:00Z' },
      { kind: 'out', at: '2026-11-24T09:00:00Z' },
      { kind: 'in', at: '2026-11-24T10:00:00Z' },
      { kind: 'out', at: '2026-11-24T13:30:00Z' },
    ]);
    expect(s).toEqual({ firstIn: '2026-11-24T05:00:00Z', lastOut: '2026-11-24T13:30:00Z', workedMinutes: 450, open: false });
  });
  it('an open session counts nothing yet', () => {
    expect(attendanceSummary([{ kind: 'in', at: '2026-11-24T05:00:00Z' }])).toEqual({ firstIn: '2026-11-24T05:00:00Z', lastOut: null, workedMinutes: 0, open: true });
    expect(attendanceSummary([])).toEqual({ firstIn: null, lastOut: null, workedMinutes: 0, open: false });
  });
});

describe('riyadhTime', () => {
  it('shows Riyadh clock time', () => expect(riyadhTime('2026-11-24T05:07:00Z')).toBe('08:07'));
  it('dash for null', () => expect(riyadhTime(null)).toBe('—'));
});

describe('attendanceStatusText', () => {
  it('describes results', () => {
    expect(attendanceStatusText({ result: 'accepted', kind: 'in' })).toBe('تم تسجيل الحضور');
    expect(attendanceStatusText({ result: 'accepted', kind: 'out' })).toBe('تم تسجيل الانصراف');
    expect(attendanceStatusText({ result: 'rejected', kind: 'in', reason: 'outside', distance_m: 340 }))
      .toBe('تم رفض التسجيل: خارج نطاق موقع العمل (تبعد 340 متر)');
    expect(attendanceStatusText({ result: 'rejected', kind: 'in', reason: 'mock' })).toBe('تم رفض التسجيل: تم اكتشاف موقع مزيف');
  });
});
