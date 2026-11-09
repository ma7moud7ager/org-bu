import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb, errorOf } from './helpers';
import { seedCompany, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('tenancy isolation', () => {
  let A: SeededCompany, B: SeededCompany, adminA: SeededEmployee, adminB: SeededEmployee, staffA: SeededEmployee;
  beforeEach(async () => {
    await resetDb();
    A = await seedCompany();
    B = await seedCompany();
    adminA = await addEmployee(A, A.rootId, 'company_admin', { isManager: true });
    adminB = await addEmployee(B, B.rootId, 'company_admin', { isManager: true });
    staffA = await addEmployee(A, A.rootId, 'employee');
  });

  it('user sees only own company', async () => {
    const r = await asUser(adminA.userId, (c) => c.query('select id from companies'));
    expect(r.rows.map((x) => x.id)).toEqual([A.companyId]);
  });
  it('cannot read another company unit by id', async () => {
    const r = await asUser(adminA.userId, (c) => c.query('select * from org_units where id = $1', [B.rootId]));
    expect(r.rowCount).toBe(0);
  });
  it('cannot update another company unit', async () => {
    const r = await asUser(adminA.userId, (c) => c.query(`update org_units set name = 'x' where id = $1`, [B.rootId]));
    expect(r.rowCount).toBe(0);
  });
  it('plain employee sees only own employee row', async () => {
    const r = await asUser(staffA.userId, (c) => c.query('select id from employees'));
    expect(r.rows.map((x) => x.id)).toEqual([staffA.employeeId]);
  });
  it('admin sees all employees of own company only', async () => {
    const r = await asUser(adminA.userId, (c) => c.query('select id from employees'));
    expect(r.rowCount).toBe(2);
  });
  it('expired subscription makes company read-only', async () => {
    await asService((c) => c.query(`update subscriptions set status = 'expired' where company_id = $1`, [A.companyId]));
    const err = await errorOf(
      asUser(adminA.userId, (c) =>
        c.query(`insert into org_units (company_id, parent_id, type, name) values ($1, $2, 'department', 'جديدة')`, [A.companyId, A.rootId]),
      ),
    );
    expect(err).toMatch(/row-level security/);
    const r = await asUser(adminA.userId, (c) => c.query('select * from org_units'));
    expect(r.rowCount).toBe(1);
  });
  it('active admin can insert unit in own company', async () => {
    const r = await asUser(adminA.userId, (c) =>
      c.query(`insert into org_units (company_id, parent_id, type, name) values ($1, $2, 'department', 'جديدة')`, [A.companyId, A.rootId]),
    );
    expect(r.rowCount).toBe(1);
  });
  it('platform admin sees both companies', async () => {
    const pa = await createAuthUser();
    await asService((c) => c.query('insert into platform_admins (user_id) values ($1)', [pa]));
    const r = await asUser(pa, (c) => c.query('select id from companies'));
    expect(r.rowCount).toBe(2);
  });
  it('no direct insert into companies or employees', async () => {
    expect(await errorOf(asUser(adminA.userId, (c) => c.query(`insert into companies (legal_name, cr_number, employee_count, activity_type) values ('x','9999999999',1,'service')`)))).not.toBeNull();
  });
});
