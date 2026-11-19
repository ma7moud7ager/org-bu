import { Sidebar } from '@/components/sidebar';

const items = [
  { href: '/admin/companies', label: 'الشركات المشتركة' },
  { href: '/admin/plans', label: 'الباقات والأسعار' },
  { href: '/admin/catalog', label: 'قائمة الإدارات' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} companyName="لوحة صاحب المنصة" userName="" />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
