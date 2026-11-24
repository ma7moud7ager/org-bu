import type { Grant, Permission, Scope } from '@orgbu/shared';

export const PERMISSION_LABELS_AR: Record<Permission, string> = {
  'structure.manage': 'إدارة الهيكل التنظيمي',
  'roles.manage': 'إدارة الأدوار والصلاحيات',
  'employees.invite': 'دعوة موظفين',
  'employees.view': 'عرض الموظفين',
  'employees.edit': 'تعديل بيانات الموظفين',
  'employees.terminate': 'إنهاء خدمة الموظفين',
  'employees.view_sensitive': 'عرض رقم الهوية كاملًا',
  'announcements.publish': 'نشر الأخبار والقرارات',
  'subscription.view': 'عرض الاشتراك',
  'employees.transfer': 'نقل الموظفين',
  'employees.request_terminate': 'رفع طلب إنهاء خدمة',
  'employees.request_transfer': 'رفع طلب نقل',
  'requests.decide': 'البت في الطلبات',
};

export const SCOPE_LABELS_AR: Record<Scope, string> = {
  company: 'الشركة كلها',
  branch: 'فرعه',
  unit: 'وحدته وما تحتها',
  self: 'نفسه',
};

const key = (g: Grant) => `${g.permission}|${g.scope}`;

export function diffGrants(before: Grant[], after: Grant[]): { add: Grant[]; remove: Grant[] } {
  const b = new Set(before.map(key));
  const a = new Set(after.map(key));
  return { add: after.filter((g) => !b.has(key(g))), remove: before.filter((g) => !a.has(key(g))) };
}
