import { describe, it, expect } from 'vitest';
import { toArabicError, callRpc } from '@/lib/errors';

describe('toArabicError', () => {
  it('maps ORG codes to Arabic', () => {
    expect(toArabicError({ message: 'ORG_UNIT_NOT_EMPTY' })).toContain('موظفين');
  });
  it('non-ORG error: RLS text becomes forbidden', () => {
    expect(toArabicError({ message: 'new row violates row-level security policy for table "x"' })).toBe(
      'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
    );
    expect(toArabicError({ message: 'permission denied for table employees' })).toBe('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
  });
  it('unknown errors become the generic message', () => {
    expect(toArabicError(new Error('fetch failed'))).toBe('حدث خطأ غير متوقع');
    expect(toArabicError(null)).toBe('حدث خطأ غير متوقع');
  });
});

describe('callRpc', () => {
  it('returns ok data', async () => {
    const client = { rpc: async () => ({ data: 5, error: null }) };
    expect(await callRpc<number>(client, 'f', {})).toEqual({ ok: true, data: 5 });
  });
  it('returns Arabic error', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'ORG_CR_TAKEN' } }) };
    expect(await callRpc(client, 'f', {})).toEqual({ ok: false, error: 'رقم السجل التجاري مسجل مسبقًا على المنصة.' });
  });
  it('catches thrown errors', async () => {
    const client = { rpc: async () => { throw new Error('network'); } };
    expect(await callRpc(client, 'f', {})).toEqual({ ok: false, error: 'حدث خطأ غير متوقع' });
  });
});
