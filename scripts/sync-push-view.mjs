// Copies the shared notification text into the push Edge Function (Deno cannot import the workspace package).
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
const root = join(import.meta.dirname, '..');
copyFileSync(join(root, 'packages/shared/src/notifications.ts'), join(root, 'supabase/functions/push/notification-view.ts'));
console.log('push/notification-view.ts synced');
