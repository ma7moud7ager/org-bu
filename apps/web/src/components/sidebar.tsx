'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { NavItem } from '@/lib/nav';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function Sidebar({ items, companyName, userName }: { items: NavItem[]; companyName: string; userName: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <p className="text-xs text-slate-400">org BU</p>
        <p className="font-bold text-teal-800">{companyName}</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`block rounded-lg px-3 py-2 text-sm ${path.startsWith(i.href) ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4 text-sm">
        <p className="text-slate-700">{userName}</p>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-red-600">تسجيل الخروج</button>
      </div>
    </aside>
  );
}
