'use client';
import { useState, useTransition } from 'react';
import { publish } from '@/app/app/announcements/actions';
import { Button, Card, ErrorText, Input } from '@/components/ui';

export function PublishForm({ companyWide, units }: { companyWide: boolean; units: Array<{ id: string; name: string }> }) {
  const [kind, setKind] = useState<'news' | 'decision'>('news');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [all, setAll] = useState(companyWide);
  const [audience, setAudience] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">نشر جديد</h2>
      <div className="flex gap-4 text-sm">
        <label><input type="radio" checked={kind === 'news'} onChange={() => setKind('news')} /> خبر</label>
        <label><input type="radio" checked={kind === 'decision'} onChange={() => setKind('decision')} /> قرار</label>
      </div>
      <Input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="النص" value={body} onChange={(e) => setBody(e.target.value)} />
      {companyWide ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> الشركة كلها</label> : null}
      {!all ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-1">
              <input type="checkbox" checked={audience.includes(u.id)} onChange={(e) => setAudience(e.target.checked ? [...audience, u.id] : audience.filter((x) => x !== u.id))} />{u.name}
            </label>
          ))}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> تثبيت في الأعلى</label>
      <ErrorText>{error}</ErrorText>
      <Button disabled={pending} onClick={() => start(async () => {
        setError(null);
        if (!all && audience.length === 0) return setError('اختر الجمهور المستهدف');
        const r = await publish(kind, title, body, all ? null : audience, pinned);
        if (r.ok) { setTitle(''); setBody(''); setAudience([]); } else setError(r.error);
      })}>نشر</Button>
    </Card>
  );
}
