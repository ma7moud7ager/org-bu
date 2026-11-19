import { describe, it, expect } from 'vitest';
import { applyNotificationEvent, unreadCount, type Notif } from '@/lib/notifications';

const n = (id: string, read = false): Notif => ({ id, type: 'announcement', payload: {}, read_at: read ? '2026-01-01' : null, created_at: '2026-01-01' });

describe('notifications reducer', () => {
  it('insert of an existing id does not duplicate', () => {
    expect(applyNotificationEvent([n('a')], { eventType: 'INSERT', new: n('a') })).toHaveLength(1);
  });
  it('insert prepends', () => {
    expect(applyNotificationEvent([n('a')], { eventType: 'INSERT', new: n('b') }).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('update marking read lowers unread count', () => {
    const list = [n('a'), n('b')];
    expect(unreadCount(list)).toBe(2);
    expect(unreadCount(applyNotificationEvent(list, { eventType: 'UPDATE', new: n('a', true) }))).toBe(1);
  });
  it('delete removes', () => {
    expect(applyNotificationEvent([n('a')], { eventType: 'DELETE', old: { id: 'a' } })).toHaveLength(0);
  });
  it('keeps at most 50', () => {
    const list = Array.from({ length: 50 }, (_, i) => n(String(i)));
    expect(applyNotificationEvent(list, { eventType: 'INSERT', new: n('new') })).toHaveLength(50);
  });
});
