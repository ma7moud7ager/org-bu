import { hasGrant, type ActorBundle } from './actor-types';

export type NavItem = { href: string; label: string };

export function navItemsFor(b: ActorBundle): NavItem[] {
  const items: NavItem[] = [
    { href: '/app/me', label: 'بياناتي' },
    { href: '/app/attendance', label: 'حضوري' },
    { href: '/app/announcements', label: 'الأخبار والقرارات' },
    { href: '/app/structure', label: 'الهيكل التنظيمي' },
  ];
  if (hasGrant(b.grants, 'employees.view', 'self')) {
    items.push({ href: '/app/employees', label: 'الموظفين' });
    items.push({ href: '/app/attendance/log', label: 'سجل الحضور' });
  }
  if (hasGrant(b.grants, 'requests.decide')) items.push({ href: '/app/requests', label: 'الطلبات الواردة' });
  if (hasGrant(b.grants, 'employees.request_terminate') || hasGrant(b.grants, 'employees.request_transfer')) {
    items.push({ href: '/app/requests/mine', label: 'طلباتي' });
  }
  if (hasGrant(b.grants, 'roles.manage')) items.push({ href: '/app/roles', label: 'الأدوار والصلاحيات' });
  return items;
}

/** The nav item whose href is the longest prefix of the path is active. */
export function activeHref(items: NavItem[], path: string): string | null {
  const hits = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
