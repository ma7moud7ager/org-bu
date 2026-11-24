import { describe, it, expect, afterEach, vi } from 'vitest';
import { biometric, currentLocation, deviceInfo, isNativeApp, pushConfigured } from '@/lib/native';

type W = typeof window & { Capacitor?: unknown };

function fakeCapacitor(plugins: Record<string, Record<string, unknown>>) {
  (window as W).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins };
}

afterEach(() => { delete (window as W).Capacitor; });

describe('native bridge in a normal browser', () => {
  it('reports unavailable everywhere', async () => {
    expect(isNativeApp()).toBe(false);
    expect(await deviceInfo()).toBeNull();
    expect(await currentLocation()).toEqual({ error: 'unavailable' });
    expect(await biometric.available()).toBe(false);
    expect(await biometric.verify('x')).toBe(false);
    expect(await pushConfigured()).toBe(false);
  });
});

describe('native bridge inside the app', () => {
  it('passes plugin values through, including the mock flag', async () => {
    fakeCapacitor({
      Device: { getId: async () => ({ identifier: 'abc123' }), getInfo: async () => ({ model: 'Pixel 8', platform: 'android' }) },
      MockLocation: {
        getCurrentPosition: async () => ({ lat: 24.7, lng: 46.6, accuracy: 12, isMock: true }),
        pushConfigured: async () => ({ configured: true }),
      },
      NativeBiometric: { isAvailable: async () => ({ isAvailable: true }), verifyIdentity: vi.fn(async () => undefined) },
    });
    expect(isNativeApp()).toBe(true);
    expect(await deviceInfo()).toEqual({ id: 'abc123', platform: 'android', model: 'Pixel 8' });
    expect(await currentLocation()).toEqual({ lat: 24.7, lng: 46.6, accuracy: 12, isMock: true });
    expect(await biometric.available()).toBe(true);
    expect(await biometric.verify('تأكيد الحضور')).toBe(true);
    expect(await pushConfigured()).toBe(true);
  });
  it('maps failures', async () => {
    fakeCapacitor({
      MockLocation: { getCurrentPosition: async () => { throw Object.assign(new Error('denied'), { code: 'DENIED' }); } },
      NativeBiometric: { isAvailable: async () => ({ isAvailable: true }), verifyIdentity: async () => { throw new Error('cancel'); } },
    });
    expect(await currentLocation()).toEqual({ error: 'denied' });
    expect(await biometric.verify('x')).toBe(false);
    expect(await deviceInfo()).toBeNull();
  });
});
