import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb } from './helpers';
import { seedCompany, addEmployee } from './fixtures';

describe('session_state()', () => {
  beforeEach(resetDb);
  it('reports employee and admin flags in one call', async () => {
    const co = await seedCompany();
    const emp = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const owner = await createAuthUser({ phone: '+966509999990' });
    await asService((c) => c.query('insert into platform_admins (user_id) values ($1)', [owner]));
    const fresh = await createAuthUser({ phone: '+966509999991' });
    const get = (u: string) => asUser(u, (c) => c.query('select * from session_state()')).then((r) => r.rows[0]);
    expect(await get(emp.userId)).toEqual({ has_employee: true, is_platform_admin: false });
    expect(await get(owner)).toEqual({ has_employee: false, is_platform_admin: true });
    expect(await get(fresh)).toEqual({ has_employee: false, is_platform_admin: false });
  });
});
