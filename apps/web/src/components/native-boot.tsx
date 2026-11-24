'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { registerDevice, type BindResult } from '@/app/app/device-actions';
import { deviceInfo, exitApp, isNativeApp, onBackButton, openExternal, registerPush, type DeviceInfo } from '@/lib/native';

type NativeState = { native: boolean; device: DeviceInfo | null; binding: BindResult | null; push: boolean };
const Ctx = createContext<NativeState>({ native: false, device: null, binding: null, push: false });
export const useNative = () => useContext(Ctx);

/** Inside the app: binds the phone, registers push, routes notification taps, opens external links outside. */
export function NativeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<NativeState>({ native: false, device: null, binding: null, push: false });
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !isNativeApp()) return;
    started.current = true;
    void (async () => {
      const device = await deviceInfo();
      setState((s) => ({ ...s, native: true, device }));
      if (!device) return;
      const bind = async (token: string | null) => {
        const r = await registerDevice(device.id, device.platform, device.model, token);
        if (r.ok) setState((s) => ({ ...s, binding: r.data, push: s.push || token !== null }));
      };
      await bind(null);
      await registerPush((token) => void bind(token), (href) => router.push(href));
    })();
    onBackButton((canGoBack) => (canGoBack ? window.history.back() : void exitApp()));
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || !a.href) return;
      const url = new URL(a.href, window.location.href);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.host !== window.location.host) {
        e.preventDefault();
        void openExternal(url.toString());
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return (
    <Ctx.Provider value={state}>
      {state.binding === 'mismatch' ? (
        <div className="bg-amber-100 px-6 py-2 text-sm text-amber-900">هذا الجوال غير مربوط بحسابك، وتم إرسال طلب للموارد البشرية.</div>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}
