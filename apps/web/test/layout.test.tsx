import { describe, it, expect } from 'vitest';
import { htmlAttributes } from '@/lib/shell';

describe('root layout', () => {
  it('is Arabic and right-to-left', () => {
    expect(htmlAttributes).toEqual({ lang: 'ar', dir: 'rtl' });
  });
});
