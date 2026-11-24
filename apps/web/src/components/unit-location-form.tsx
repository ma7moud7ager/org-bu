'use client';
import { useState, useTransition } from 'react';
import { parseMapsLink } from '@orgbu/shared';
import { setUnitLocation } from '@/app/app/attendance/actions';
import { currentLocation } from '@/lib/native';
import { useNative } from '@/components/native-boot';
import { Button, ErrorText, Input } from '@/components/ui';

export type UnitGeo = { lat: number | null; lng: number | null; radius: number };

export function UnitLocationForm({ unitId, geo }: { unitId: string; geo: UnitGeo }) {
  const { native } = useNative();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(geo.lat !== null ? `${geo.lat}, ${geo.lng}` : '');
  const [radius, setRadius] = useState(String(geo.radius));
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const summary = geo.lat !== null ? `📍 موقع العمل محدد (${geo.radius} م)` : 'موقع العمل غير محدد';
  if (!open) return <button className="text-xs text-teal-700" onClick={() => setOpen(true)}>{summary}</button>;
  const save = (lat: number | null, lng: number | null) => run(async () => {
    setError(null);
    const r = await setUnitLocation(unitId, lat, lng, Number(radius) || 100);
    if (r.ok) setOpen(false); else setError(r.error);
  });
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
      <Input placeholder="الصق رابط Google Maps أو الإحداثيات" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} />
      <label className="flex items-center gap-2">النطاق بالمتر <Input type="number" min={20} max={2000} value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => {
          const p = parseMapsLink(link);
          if (!p) return setError('لم نتعرف على الإحداثيات في الرابط');
          save(p.lat, p.lng);
        }}>حفظ</Button>
        {native ? (
          <Button variant="ghost" disabled={pending} onClick={async () => {
            const p = await currentLocation();
            if ('error' in p) return setError('تعذر تحديد موقعك');
            if (p.isMock) return setError('تم اكتشاف موقع مزيف');
            setLink(`${p.lat}, ${p.lng}`);
            save(p.lat, p.lng);
          }}>استخدم موقعي الحالي</Button>
        ) : null}
        {geo.lat !== null ? <Button variant="ghost" disabled={pending} onClick={() => save(null, null)}>إزالة الموقع</Button> : null}
        <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </div>
  );
}
