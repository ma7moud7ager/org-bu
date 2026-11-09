import { describe, it, expect } from 'vitest';
import { asUser, errorOf } from './helpers';

describe('function exposure to anonymous callers', () => {
  it.each([
    'select current_company_id()',
    'select is_platform_admin()',
    "select has_permission('employees.view', gen_random_uuid())",
    'select unit_path(gen_random_uuid())',
    'select company_is_writable(gen_random_uuid())',
  ])('anon cannot run %s', async (sql) => {
    expect(await errorOf(asUser(null, (c) => c.query(sql)))).toMatch(/permission denied/);
  });
  it('anon can still preview invitations (intended)', async () => {
    expect(await errorOf(asUser(null, (c) => c.query(`select * from preview_invitation('x')`)))).toBe('ORG_INVITE_INVALID');
  });
});
