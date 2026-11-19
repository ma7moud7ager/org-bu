import { redirect } from 'next/navigation';
import { messageFor } from '@orgbu/shared';
import { loadActor } from '@/lib/actor';
import { navItemsFor } from '@/lib/nav';
import { Sidebar } from '@/components/sidebar';
import { NotificationBell } from '@/components/notification-bell';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const bundle = await loadActor();
  if (!bundle) redirect('/onboarding');
  return (
    <div className="flex min-h-screen">
      <Sidebar items={navItemsFor(bundle)} companyName={bundle.companyName} userName={bundle.employee.fullName} />
      <div className="flex-1">
        <header className="flex justify-end border-b border-slate-200 bg-white px-6 py-2">{bundle.employee.userId ? <NotificationBell userId={bundle.employee.userId} /> : null}</header>
        {!bundle.writable ? <div className="bg-amber-100 px-6 py-2 text-sm text-amber-900">{messageFor('ORG_SUBSCRIPTION_INACTIVE')}</div> : null}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
