import { ERROR_CODES, messageFor } from '@orgbu/shared';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function toArabicError(e: unknown): string {
  const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : '';
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === 'sms_send_failed') return 'تعذر إرسال رسالة التحقق. حاول مرة أخرى بعد قليل.';
  if ((ERROR_CODES as readonly string[]).includes(message)) return messageFor(message);
  if (/row-level security|permission denied/i.test(message)) return messageFor('ORG_FORBIDDEN');
  return messageFor('UNKNOWN');
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function callRpc<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await client.rpc(fn, args);
    if (error) return { ok: false, error: toArabicError(error) };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: toArabicError(e) };
  }
}

export function fail(code: string): { ok: false; error: string } {
  return { ok: false, error: messageFor(code) };
}
