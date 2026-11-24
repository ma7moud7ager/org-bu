// Sends one notification to the user's bound phone through Firebase Cloud Messaging (HTTP v1).
// Called only by the database (trigger → pg_net) with the shared secret in x-push-secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { notificationView } from './notification-view.ts';

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

const b64url = (data: ArrayBuffer | string) =>
  btoa(typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('fcm auth failed');
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('unauthorized', { status: 401 });
  const saJson = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!saJson) return new Response('push disabled', { status: 200 });
  const { notification_id } = await req.json();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: n } = await db.from('notifications').select('id, user_id, type, payload').eq('id', notification_id).maybeSingle();
  if (!n) return new Response('no notification', { status: 200 });
  const { data: dev } = await db.from('employee_devices')
    .select('id, push_token, employees!inner(user_id)')
    .eq('employees.user_id', n.user_id).eq('status', 'active').not('push_token', 'is', null).maybeSingle();
  if (!dev?.push_token) return new Response('no device', { status: 200 });

  const sa = JSON.parse(saJson) as ServiceAccount;
  const view = notificationView({ type: n.type, payload: n.payload ?? {} });
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken(sa)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: dev.push_token,
        notification: { title: 'org BU', body: view.text },
        data: { href: view.href ?? '/app', notification_id: n.id },
        android: { priority: 'high' },
      },
    }),
  });
  if (res.status === 404 || res.status === 400) {
    const body = await res.text();
    if (/UNREGISTERED|INVALID_ARGUMENT/.test(body)) await db.from('employee_devices').update({ push_token: null }).eq('id', dev.id);
    return new Response(body, { status: 200 });
  }
  return new Response(await res.text(), { status: res.ok ? 200 : 502 });
});
