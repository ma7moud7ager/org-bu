import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb, errorOf } from './helpers';
import { seedCompany, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('platform owner panel', () => {
  let A: SeededCompany, B: SeededCompany, adminA: SeededEmployee, owner: string;
  beforeEach(async () => {
    await resetDb();
    A = await seedCompany();
    B = await seedCompany();
    adminA = await addEmployee(A, A.rootId, 'company_admin', { isManager: true });
    await addEmployee(A, A.rootId, 'employee');
    await addEmployee(B, B.rootId, 'company_admin', { isManager: true });
    owner = await createAuthUser({ phone: '+966509999999' });
    await asService((c) => c.query('insert into platform_admins (user_id) values ($1)', [owner]));
  });

  it('owner gets an overview row per company with employee counts', async () => {
    const r = await asUser(owner, (c) => c.query('select company_id, employee_count, sub_status from admin_company_overview()'));
    expect(r.rowCount).toBe(2);
    const a = r.rows.find((x) => x.company_id === A.companyId)!;
    expect(Number(a.employee_count)).toBe(2);
    expect(a.sub_status).toBe('trial');
  });
  it('company admin cannot call the overview', async () => {
    expect(await errorOf(asUser(adminA.userId, (c) => c.query('select * from admin_company_overview()')))).toBe('ORG_FORBIDDEN');
  });
  it('owner can suspend a company, company admin cannot', async () => {
    const ok = await asUser(owner, (c) => c.query(`update companies set status = 'suspended' where id = $1`, [B.companyId]));
    expect(ok.rowCount).toBe(1);
    const no = await asUser(adminA.userId, (c) => c.query(`update companies set status = 'suspended' where id = $1`, [A.companyId])).catch((e) => e);
    expect(no instanceof Error ? no.message : String(no.rowCount)).toMatch(/permission denied|^0$/);
  });
  it('owner cannot change a company legal name directly', async () => {
    expect(await errorOf(asUser(owner, (c) => c.query(`update companies set legal_name = 'x' where id = $1`, [B.companyId])))).toMatch(/permission denied/);
  });
});
