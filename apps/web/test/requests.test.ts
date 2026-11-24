import { describe, it, expect } from 'vitest';
import { requestStatusBadge, requestSummary } from '@/lib/requests';
import { notificationView } from '@/lib/notifications';

describe('requests display', () => {
  it('status badges', () => {
    expect(requestStatusBadge('pending')).toEqual({ label: 'قيد المراجعة', tone: 'amber' });
    expect(requestStatusBadge('approved')).toEqual({ label: 'تمت الموافقة', tone: 'green' });
    expect(requestStatusBadge('rejected')).toEqual({ label: 'مرفوض', tone: 'red' });
    expect(requestStatusBadge('postponed')).toEqual({ label: 'مؤجل', tone: 'slate' });
    expect(requestStatusBadge('cancelled')).toEqual({ label: 'ملغي', tone: 'slate' });
  });
  it('summaries', () => {
    expect(requestSummary({ type: 'termination', payload: { reason: 'resignation', last_day: '2026-12-01' } }))
      .toBe('إنهاء خدمة — استقالة — آخر يوم عمل 2026-12-01');
    expect(requestSummary({ type: 'transfer', payload: { target_position: 'p1', run_at: null } }, { p1: 'كاشير — فرع 2' }))
      .toBe('نقل إلى كاشير — فرع 2 — فوري');
    expect(requestSummary({ type: 'transfer', payload: { new_unit: 'u', new_title: 'مشرف', new_role: 'r', run_at: '2027-01-05' } }))
      .toBe('نقل إلى منصب جديد: مشرف — بتاريخ 2027-01-05');
  });
});

describe('notificationView', () => {
  const n = (type: string, payload: Record<string, unknown>) => ({ id: '1', type, payload, read_at: null, created_at: '' });
  it('maps each type to text and a link', () => {
    expect(notificationView(n('announcement', { kind: 'decision', title: 'دوام رمضان', announcement_id: 'a' })))
      .toEqual({ text: 'قرار جديد: دوام رمضان', href: '/app/announcements#a' });
    expect(notificationView(n('request_new', { type: 'termination', subject_name: 'سالم', requester_name: 'خالد' })))
      .toEqual({ text: 'طلب إنهاء خدمة جديد لـ سالم من خالد', href: '/app/requests' });
    expect(notificationView(n('request_decided', { type: 'transfer', decision: 'reject', subject_name: 'سالم' })))
      .toEqual({ text: 'تم رفض طلب النقل لـ سالم', href: '/app/requests/mine' });
    expect(notificationView(n('document_updated', { employee_id: 'e', employee_name: 'سالم' })))
      .toEqual({ text: 'سالم حدّث بيانات الإقامة — راجعها', href: '/app/employees/e' });
    expect(notificationView(n('scheduled_failed', { kind: 'transfer', employee_id: 'e', employee_name: 'سالم' })))
      .toEqual({ text: 'تعذر تنفيذ النقل المجدول لـ سالم', href: '/app/employees/e' });
  });
});
