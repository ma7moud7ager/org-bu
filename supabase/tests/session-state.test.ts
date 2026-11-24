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
    expect(await get(emp.userId)).toEqual({ has_employee: true, is_platform_admin: false, is_terminated: false });
    expect(await get(owner)).toEqual({ has_employee: false, is_platform_admin: true, is_terminated: false });
    expect(await get(fresh)).toEqual({ has_employee: false, is_platform_admin: false, is_terminated: false });
  });
});

describe('session_state() for terminated users', () => {
  beforeEach(resetDb);
  it('flags is_terminated and exposes the company name only to them', async () => {
    const co = await seedCompany();
    await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const w = await addEmployee(co, co.rootId, 'employee');
    await asService((c) => c.query(`update employees set status = 'terminated', position_id = null where id = $1`, [w.employeeId]));
    const r = await asUser(w.userId, (c) => c.query('select * from session_state()'));
    expect(r.rows[0]).toEqual({ has_employee: false, is_platform_admin: false, is_terminated: true });
    const n = await asUser(w.userId, (c) => c.query('select ended_company_name() as n'));
    expect(n.rows[0]!.n).toMatch(/^شركة /);
  });
});
