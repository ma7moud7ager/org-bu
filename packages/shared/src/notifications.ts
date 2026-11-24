// Single source of notification text and links — used by the web bell and the push Edge Function.

export type NotificationLike = { type: string; payload: Record<string, unknown> };

export const ATTENDANCE_REASON_AR: Record<string, string> = {
  device: 'الجوال غير مربوط بالحساب',
  biometric: 'لم يتم التحقق بالبصمة',
  mock: 'تم اكتشاف موقع مزيف',
  accuracy: 'دقة الموقع ضعيفة',
  no_location: 'لم يتم تحديد موقع العمل',
  outside: 'خارج نطاق موقع العمل',
  sequence: 'ترتيب التسجيل غير صحيح',
};

const REQUEST_NEW: Record<string, string> = { termination: 'إنهاء خدمة', transfer: 'نقل', device_change: 'تغيير الجوال' };
const REQUEST_DECIDED: Record<string, string> = { termination: 'إنهاء الخدمة', transfer: 'النقل', device_change: 'تغيير الجوال' };
const SCHEDULED: Record<string, string> = { termination: 'إنهاء خدمة', transfer: 'النقل' };
const DECISION: Record<string, string> = { approve: 'تمت الموافقة على', reject: 'تم رفض', postpone: 'تم تأجيل' };

export function notificationView(n: NotificationLike): { text: string; href: string | null } {
  const p = n.payload as Record<string, string | undefined>;
  switch (n.type) {
    case 'announcement':
      return { text: `${p.kind === 'decision' ? 'قرار جديد: ' : 'خبر جديد: '}${p.title ?? ''}`, href: p.announcement_id ? `/app/announcements#${p.announcement_id}` : null };
    case 'request_new':
      return { text: `طلب ${REQUEST_NEW[p.type ?? ''] ?? 'جديد'} جديد لـ ${p.subject_name} من ${p.requester_name}`, href: '/app/requests' };
    case 'request_decided':
      return { text: `${DECISION[p.decision ?? ''] ?? 'تحديث على'} طلب ${REQUEST_DECIDED[p.type ?? ''] ?? ''} لـ ${p.subject_name}`, href: '/app/requests/mine' };
    case 'document_updated':
      return { text: `${p.employee_name} حدّث بيانات الإقامة — راجعها`, href: `/app/employees/${p.employee_id}` };
    case 'scheduled_failed':
      return { text: `تعذر تنفيذ ${SCHEDULED[p.kind ?? ''] ?? 'الإجراء'} المجدول لـ ${p.employee_name}`, href: `/app/employees/${p.employee_id}` };
    case 'attendance_rejected':
      return { text: `تم رفض تسجيل ${p.kind === 'out' ? 'انصراف' : 'حضور'} لـ ${p.employee_name}: ${ATTENDANCE_REASON_AR[p.reason ?? ''] ?? ''}`, href: '/app/attendance' };
    default:
      return { text: 'إشعار جديد', href: null };
  }
}
