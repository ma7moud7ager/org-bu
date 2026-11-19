import { hasGrant, type ActorBundle } from './actor-types';

export type NavItem = { href: string; label: string };

export function navItemsFor(b: ActorBundle): NavItem[] {
  const items: NavItem[] = [
    { href: '/app/announcements', label: 'الأخبار والقرارات' },
    { href: '/app/structure', label: 'الهيكل التنظيمي' },
  ];
  if (hasGrant(b.grants, 'employees.view', 'self')) items.push({ href: '/app/employees', label: 'الموظفين' });
  if (hasGrant(b.grants, 'roles.manage')) items.push({ href: '/app/roles', label: 'الأدوار والصلاحيات' });
  return items;
}
