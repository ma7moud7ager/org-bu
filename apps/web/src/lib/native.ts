// The only place the web app talks to the phone (Capacitor plugins injected into the page by the org BU app).
// In a normal browser every function reports "unavailable".

type AnyPlugin = Record<string, (...args: unknown[]) => Promise<unknown>> & {
  addListener?: (event: string, cb: (data: unknown) => void) => Promise<unknown> | unknown;
};
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, AnyPlugin> };

const cap = (): Cap | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);
const plugin = (name: string): AnyPlugin | undefined => (isNativeApp() ? cap()?.Plugins?.[name] : undefined);

export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

export type DeviceInfo = { id: string; platform: 'android' | 'ios'; model: string | null };

export async function deviceInfo(): Promise<DeviceInfo | null> {
  const d = plugin('Device');
  if (!d) return null;
  try {
    const [id, info] = (await Promise.all([d.getId(), d.getInfo()])) as [{ identifier: string }, { model?: string; platform?: string }];
    const platform = info.platform === 'ios' ? 'ios' : 'android';
    return { id: id.identifier, platform, model: info.model ?? null };
  } catch {
    return null;
  }
}

export type Position = { lat: number; lng: number; accuracy: number; isMock: boolean };
export type PositionError = { error: 'denied' | 'unavailable' };

export async function currentLocation(): Promise<Position | PositionError> {
  const m = plugin('MockLocation');
  if (!m) return { error: 'unavailable' };
  try {
    const p = (await m.getCurrentPosition()) as Position;
    return { lat: p.lat, lng: p.lng, accuracy: p.accuracy, isMock: p.isMock === true };
  } catch (e) {
    const code = (e as { code?: string; message?: string }).code ?? (e as Error).message;
    return { error: /denied/i.test(String(code)) ? 'denied' : 'unavailable' };
  }
}

export const biometric = {
  async available(): Promise<boolean> {
    const b = plugin('NativeBiometric');
    if (!b) return false;
    try {
      return ((await b.isAvailable()) as { isAvailable?: boolean }).isAvailable === true;
    } catch {
      return false;
    }
  },
  /** Prompts for fingerprint / Face ID on the phone. Nothing biometric leaves the device. */
  async verify(reason: string): Promise<boolean> {
    const b = plugin('NativeBiometric');
    if (!b) return false;
    try {
      await b.verifyIdentity({ reason, title: 'org BU', subtitle: reason, description: '', negativeButtonText: 'إلغاء' });
      return true;
    } catch {
      return false;
    }
  },
};

export async function pushConfigured(): Promise<boolean> {
  const m = plugin('MockLocation');
  if (!m) return false;
  try {
    return ((await m.pushConfigured()) as { configured?: boolean }).configured === true;
  } catch {
    return false;
  }
}

/** Asks for permission, registers with FCM, reports the token and taps on notifications (href in data). */
export async function registerPush(onToken: (token: string) => void, onTap: (href: string) => void): Promise<boolean> {
  const p = plugin('PushNotifications');
  if (!p || !(await pushConfigured())) return false;
  try {
    const perm = (await p.requestPermissions()) as { receive?: string };
    if (perm.receive !== 'granted') return false;
    await p.addListener?.('registration', (t) => onToken((t as { value: string }).value));
    await p.addListener?.('pushNotificationActionPerformed', (a) => {
      const href = (a as { notification?: { data?: { href?: string } } }).notification?.data?.href;
      if (href && href.startsWith('/')) onTap(href);
    });
    await p.register();
    return true;
  } catch {
    return false;
  }
}

/** Opens a non-platform link in the phone's browser. */
export async function openExternal(url: string): Promise<boolean> {
  const b = plugin('Browser');
  if (!b) return false;
  try {
    await b.open({ url });
    return true;
  } catch {
    return false;
  }
}

export function onBackButton(cb: (canGoBack: boolean) => void): void {
  plugin('App')?.addListener?.('backButton', (e) => cb((e as { canGoBack?: boolean }).canGoBack === true));
}

export async function exitApp(): Promise<void> {
  await plugin('App')?.exitApp?.();
}
