export type Notif = { id: string; type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string };
export type NotifEvent = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: Notif; old?: { id: string } };

const MAX = 50;

export function applyNotificationEvent(list: Notif[], ev: NotifEvent): Notif[] {
  if (ev.eventType === 'INSERT' && ev.new) {
    if (list.some((x) => x.id === ev.new!.id)) return list;
    return [ev.new, ...list].slice(0, MAX);
  }
  if (ev.eventType === 'UPDATE' && ev.new) return list.map((x) => (x.id === ev.new!.id ? ev.new! : x));
  if (ev.eventType === 'DELETE' && ev.old) return list.filter((x) => x.id !== ev.old!.id);
  return list;
}

export const unreadCount = (list: Notif[]) => list.filter((x) => !x.read_at).length;

const TYPE_AR: Record<string, string> = { termination: 'إنهاء خدمة', transfer: 'النقل' };
const DECISION_AR: Record<string, string> = { approve: 'تمت الموافقة على', reject: 'تم رفض', postpone: 'تم تأجيل' };

/** Text and link for a bell item. */
export function notificationView(n: Notif): { text: string; href: string | null } {
  const p = n.payload as Record<string, string | undefined>;
  switch (n.type) {
    case 'announcement':
      return { text: `${p.kind === 'decision' ? 'قرار جديد: ' : 'خبر جديد: '}${p.title ?? ''}`, href: p.announcement_id ? `/app/announcements#${p.announcement_id}` : null };
    case 'request_new':
      return { text: `طلب ${p.type === 'transfer' ? 'نقل' : 'إنهاء خدمة'} جديد لـ ${p.subject_name} من ${p.requester_name}`, href: '/app/requests' };
    case 'request_decided':
      return { text: `${DECISION_AR[p.decision ?? ''] ?? 'تحديث على'} طلب ${p.type === 'transfer' ? 'النقل' : 'إنهاء الخدمة'} لـ ${p.subject_name}`, href: '/app/requests/mine' };
    case 'document_updated':
      return { text: `${p.employee_name} حدّث بيانات الإقامة — راجعها`, href: `/app/employees/${p.employee_id}` };
    case 'scheduled_failed':
      return { text: `تعذر تنفيذ ${TYPE_AR[p.kind ?? ''] ?? 'الإجراء'} المجدول لـ ${p.employee_name}`, href: `/app/employees/${p.employee_id}` };
    default:
      return { text: 'إشعار جديد', href: null };
  }
}
