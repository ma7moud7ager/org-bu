'use client';
import { useEffect, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { applyNotificationEvent, notificationView, unreadCount, type Notif, type NotifEvent } from '@/lib/notifications';

type Action = { type: 'reset'; list: Notif[] } | { type: 'event'; ev: NotifEvent };
const reducer = (s: Notif[], a: Action) => (a.type === 'reset' ? a.list : applyNotificationEvent(s, a.ev));

export function NotificationBell({ userId }: { userId: string }) {
  const [list, dispatch] = useReducer(reducer, []);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.from('notifications').select('id, type, payload, read_at, created_at').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => dispatch({ type: 'reset', list: (data ?? []) as Notif[] }));
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (p) =>
        dispatch({ type: 'event', ev: { eventType: p.eventType, new: p.new as Notif, old: p.old as { id: string } } }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.read_at) {
      const read_at = new Date().toISOString();
      dispatch({ type: 'event', ev: { eventType: 'UPDATE', new: { ...n, read_at } } });
      await createBrowserSupabase().from('notifications').update({ read_at }).eq('id', n.id);
    }
    const { href } = notificationView(n);
    if (href) router.push(href);
  }

  const count = unreadCount(list);
  return (
    <div className="relative">
      <button aria-label="الإشعارات" onClick={() => setOpen(!open)} className="relative rounded-full p-2 hover:bg-slate-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {count ? <span className="absolute -top-0.5 -start-0.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{count}</span> : null}
      </button>
      {open ? (
        <div className="absolute end-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          {list.length === 0 ? <p className="p-4 text-sm text-slate-400">لا توجد إشعارات</p> : null}
          <ul className="max-h-96 overflow-y-auto">
            {list.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={`block w-full px-4 py-3 text-start text-sm hover:bg-slate-50 ${n.read_at ? 'text-slate-500' : 'font-medium'}`}>
                  {notificationView(n).text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
