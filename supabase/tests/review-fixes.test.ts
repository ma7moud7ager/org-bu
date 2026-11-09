import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb, errorOf } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('privilege escalation through role assignment', () => {
  let co: SeededCompany, admin: SeededEmployee, hr: SeededEmployee, HR: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    HR = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية', true);
    hr = await addEmployee(co, HR, 'hr');
  });
  const insertPosition = (user: string, role: string) =>
    asUser(user, (c) =>
      c.query(`insert into positions (company_id, org_unit_id, title, role_id) values ($1, $2, 'منصب', $3)`, [co.companyId, HR, role]),
    );

  it('hr cannot create a position with the company_admin role', async () => {
    expect(await errorOf(insertPosition(hr.userId, co.roles.company_admin))).toMatch(/row-level security/);
  });
  it('hr can create a position with the employee role', async () => {
    expect(await errorOf(insertPosition(hr.userId, co.roles.employee))).toBeNull();
  });
  it('company admin can create an admin position', async () => {
    expect(await errorOf(insertPosition(admin.userId, co.roles.company_admin))).toBeNull();
  });
  it('hr cannot upgrade an existing position to company_admin', async () => {
    const pos = await asService((c) =>
      c.query<{ id: string }>(`insert into positions (company_id, org_unit_id, title, role_id) values ($1, $2, 'x', $3) returning id`, [co.companyId, HR, co.roles.employee]),
    ).then((r) => r.rows[0]!.id);
    const r = await asUser(hr.userId, (c) => c.query('update positions set role_id = $1 where id = $2', [co.roles.company_admin, pos])).catch((e) => e);
    expect(r instanceof Error ? r.message : String(r.rowCount)).toMatch(/row-level security|^0$/);
  });
  it('hr cannot invite into a vacant admin position', async () => {
    const pos = await asService((c) =>
      c.query<{ id: string }>(`insert into positions (company_id, org_unit_id, title, role_id) values ($1, $2, 'مدير حساب 2', $3) returning id`, [co.companyId, co.rootId, co.roles.company_admin]),
    ).then((r) => r.rows[0]!.id);
    expect(await errorOf(asUser(hr.userId, (c) => c.query(`select create_invitation($1, 'x@x.sa')`, [pos])))).toBe('ORG_FORBIDDEN');
  });
  it('cannot assign a role belonging to another company', async () => {
    const other = await seedCompany();
    expect(await errorOf(insertPosition(admin.userId, other.roles.employee))).toMatch(/row-level security/);
  });
});

describe('register_company uses the verified phone', () => {
  beforeEach(resetDb);
  it('rejects a phone different from the caller auth phone', async () => {
    const u = await createAuthUser({ phone: '+966550000010' });
    const err = await errorOf(
      asUser(u, (c) => c.query(`select register_company('شركة', '1010000099', 5, 'service', '{}', 'مدير', '+966559999999', 'q@co.sa')`)),
    );
    expect(err).toBe('ORG_VALIDATION');
  });
  it('accepts the caller auth phone', async () => {
    const u = await createAuthUser({ phone: '+966550000011' });
    const err = await errorOf(
      asUser(u, (c) => c.query(`select register_company('شركة', '1010000098', 5, 'service', '{}', 'مدير', '+966550000011', 'w@co.sa')`)),
    );
    expect(err).toBeNull();
  });
});

describe('Supabase stores auth phones without "+"', () => {
  beforeEach(resetDb);
  it('register_company works when auth phone lacks the plus sign and stores +966 format', async () => {
    const u = await createAuthUser({ phone: '966550000012' });
    const err = await errorOf(
      asUser(u, (c) => c.query(`select register_company('شركة', '1010000097', 5, 'service', '{}', 'مدير', '+966550000012', 'e@co.sa')`)),
    );
    expect(err).toBeNull();
    const r = await asService((c) => c.query('select phone from employees where user_id = $1', [u]));
    expect(r.rows[0]!.phone).toBe('+966550000012');
  });
});
