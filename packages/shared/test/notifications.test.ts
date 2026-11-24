import { describe, it, expect } from 'vitest';
import { notificationView, ATTENDANCE_REASON_AR } from '../src/notifications';

const n = (type: string, payload: Record<string, unknown>) => ({ type, payload });

describe('notificationView (shared)', () => {
  it('attendance rejected', () => {
    expect(notificationView(n('attendance_rejected', { kind: 'in', employee_name: 'سالم', reason: 'outside' })))
      .toEqual({ text: 'تم رفض تسجيل حضور لـ سالم: خارج نطاق موقع العمل', href: '/app/attendance' });
    expect(notificationView(n('attendance_rejected', { kind: 'out', employee_name: 'سالم', reason: 'device' })).text)
      .toBe('تم رفض تسجيل انصراف لـ سالم: الجوال غير مربوط بالحساب');
  });
  it('device change requests', () => {
    expect(notificationView(n('request_new', { type: 'device_change', subject_name: 'سالم', requester_name: 'سالم' })))
      .toEqual({ text: 'طلب تغيير الجوال جديد لـ سالم من سالم', href: '/app/requests' });
    expect(notificationView(n('request_decided', { type: 'device_change', decision: 'approve', subject_name: 'سالم' })).text)
      .toBe('تمت الموافقة على طلب تغيير الجوال لـ سالم');
  });
  it('has labels for all 7 reasons', () =>
    expect(Object.keys(ATTENDANCE_REASON_AR).sort()).toEqual(['accuracy', 'biometric', 'device', 'mock', 'no_location', 'outside', 'sequence']));
});
