export type Notif = { id: string; type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string };
export type NotifEvent = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: Notif; old?: { id: string } };

const MAX = 50;

export function applyNotificationEvent(list: Notif[], ev: NotifEvent): Notif[] {
  if (ev.eventType === 'INSERT' && ev.new) {
    if (list.some((x) => x.id === ev.new!.id)) return list;
    return [ev.new, ...list].slice(0, MAX);
  }
  if (ev.eventType === 'UPDATE' && ev.new) return list.map((x) => (x.id === ev.new!.id ? ev.new! : x));
  if (ev.eventType === 'DELETE' && ev.old) return list.filter((x) => x.id !== ev.old!.id);
  return list;
}

export const unreadCount = (list: Notif[]) => list.filter((x) => !x.read_at).length;
