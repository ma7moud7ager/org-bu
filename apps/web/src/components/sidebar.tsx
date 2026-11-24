'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { activeHref, type NavItem } from '@/lib/nav';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { useNative } from '@/components/native-boot';

export function Sidebar({ items, companyName, userName }: { items: NavItem[]; companyName: string; userName: string }) {
  const path = usePathname();
  const router = useRouter();
  const { native } = useNative();
  const [open, setOpen] = useState(false);
  const all = native ? [...items, { href: '/app/device', label: 'جاهزية الجهاز' }] : items;
  const active = activeHref(all, path);
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <>
      <button aria-label="القائمة" onClick={() => setOpen(true)} className="fixed top-2 start-2 z-30 rounded-lg border border-slate-200 bg-white p-2 md:hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      {open ? <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={`${open ? 'fixed inset-y-0 start-0 z-40 flex' : 'hidden'} w-60 shrink-0 flex-col border-l border-slate-200 bg-white md:static md:flex`}>
        <div className="border-b border-slate-200 p-4">
          <p className="text-xs text-slate-400">org BU</p>
          <p className="font-bold text-teal-800">{companyName}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {all.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm ${active === i.href ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>
              {i.label}
            </Link>
          ))}
          {!native ? <Link href="/download" className="block rounded-lg px-3 py-2 text-sm text-teal-700">📱 حمّل التطبيق</Link> : null}
        </nav>
        <div className="border-t border-slate-200 p-4 text-sm">
          <p className="text-slate-700">{userName}</p>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-red-600">تسجيل الخروج</button>
        </div>
      </aside>
    </>
  );
}
