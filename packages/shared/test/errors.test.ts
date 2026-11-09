import { describe, it, expect } from 'vitest';
import { ERROR_CODES, ERROR_MESSAGES_AR, messageFor } from '../src/errors';

describe('error messages', () => {
  it('every code has a non-empty Arabic message', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES_AR[code]).toMatch(/[؀-ۿ]/);
    }
  });
  it('unit-not-empty message mentions employees', () => {
    expect(messageFor('ORG_UNIT_NOT_EMPTY')).toContain('موظفين');
  });
  it('unknown code falls back to generic message', () => {
    expect(messageFor('NOPE')).toBe('حدث خطأ غير متوقع');
  });
});
