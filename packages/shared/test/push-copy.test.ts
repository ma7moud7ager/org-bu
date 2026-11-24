import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('push Edge Function text', () => {
  it('uses an exact copy of the shared notification text (run scripts/sync-push-view.mjs)', () => {
    const root = join(import.meta.dirname, '..', '..', '..');
    const shared = readFileSync(join(root, 'packages/shared/src/notifications.ts'), 'utf8');
    const copy = readFileSync(join(root, 'supabase/functions/push/notification-view.ts'), 'utf8');
    expect(copy).toBe(shared);
  });
});
