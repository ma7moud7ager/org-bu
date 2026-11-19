'use client';
import { useState } from 'react';
import { markRead } from '@/app/app/announcements/actions';

export function AnnouncementItem({ a, unread }: { a: { id: string; kind: string; title: string; body: string; pinned: boolean; published_at: string }; unread: boolean }) {
  const [open, setOpen] = useState(false);
  const [isUnread, setUnread] = useState(unread);
  return (
    <article id={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <button className="flex w-full items-center gap-2 text-start" onClick={() => { setOpen(!open); if (isUnread) { setUnread(false); void markRead(a.id); } }}>
        {isUnread ? <span className="h-2 w-2 rounded-full bg-teal-600" aria-label="غير مقروء" /> : null}
        {a.kind === 'decision' ? <span className="rounded bg-amber-100 px-2 text-xs text-amber-800">قرار</span> : null}
        {a.pinned ? <span className="text-xs text-slate-400">مثبت</span> : null}
        <span className="font-medium">{a.title}</span>
        <span className="ms-auto text-xs text-slate-400">{new Date(a.published_at).toLocaleDateString('ar-SA')}</span>
      </button>
      {open ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p> : null}
    </article>
  );
}
