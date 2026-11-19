'use client';
import { useState, useTransition } from 'react';
import { addCatalog, removeCatalog } from '@/app/admin/actions';
import { Button, Card, ErrorText, Input } from '@/components/ui';

export type CatalogRow = { id: string; name_ar: string; name_en: string; is_fixed: boolean };

export function CatalogEditor({ rows }: { rows: CatalogRow[] }) {
  const [ar, setAr] = useState('');
  const [en, setEn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-4">
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span className="font-medium">{r.name_ar}</span>
            <span className="text-slate-400" dir="ltr">{r.name_en}</span>
            {r.is_fixed ? <span className="ms-auto text-xs text-teal-700">ثابتة</span> : (
              <button className="ms-auto text-xs text-red-600" disabled={pending} onClick={() => start(async () => { const x = await removeCatalog(r.id); if (!x.ok) setError(x.error); })}>حذف</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input placeholder="الاسم بالعربي" value={ar} onChange={(e) => setAr(e.target.value)} />
        <Input placeholder="English name" dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} />
        <Button disabled={pending} onClick={() => start(async () => { const x = await addCatalog(ar, en); if (x.ok) { setAr(''); setEn(''); } else setError(x.error); })}>إضافة</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
