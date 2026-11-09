import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, resetDb, errorOf, db } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('sensitive identity data and audit', () => {
  let co: SeededCompany, admin: SeededEmployee, hr: SeededEmployee, bm: SeededEmployee, staff: SeededEmployee;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const HR = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية', true);
    const B = await addUnit(co.companyId, co.rootId, 'branch', 'فرع');
    hr = await addEmployee(co, HR, 'hr');
    bm = await addEmployee(co, B, 'branch_manager', { isManager: true });
    staff = await addEmployee(co, B, 'employee');
  });

  const setOwnIqama = (num: string) =>
    asUser(staff.userId, (c) => c.query(`select set_employee_identity($1, 'iqama', $2, '2030-01-01', null)`, [staff.employeeId, num]));

  it('employee stores own iqama encrypted with last4', async () => {
    await setOwnIqama('2123456789');
    const r = await db().query('select identity_last4, encode(identity_number_enc, $2) as raw from employees where id = $1', [staff.employeeId, 'escape']);
    expect(r.rows[0]!.identity_last4).toBe('6789');
    expect(r.rows[0]!.raw).not.toContain('2123456789');
  });
  it('rejects iqama not starting with 2', async () => {
    expect(await errorOf(setOwnIqama('1123456789'))).toBe('ORG_VALIDATION');
  });
  it('employee cannot set another employee identity', async () => {
    expect(await errorOf(asUser(staff.userId, (c) => c.query(`select set_employee_identity($1, 'iqama', '2123456789', '2030-01-01', null)`, [hr.employeeId])))).toBe('ORG_FORBIDDEN');
  });
  it('hr reads the full number and it is audited', async () => {
    await setOwnIqama('2123456789');
    const r = await asUser(hr.userId, (c) => c.query('select get_employee_identity_number($1) as n', [staff.employeeId]));
    expect(r.rows[0]!.n).toBe('2123456789');
    const a = await db().query(`select 1 from audit_log where action = 'identity.read' and entity_id = $1`, [staff.employeeId]);
    expect(a.rowCount).toBe(1);
  });
  it('branch manager cannot read full number', async () => {
    await setOwnIqama('2123456789');
    expect(await errorOf(asUser(bm.userId, (c) => c.query('select get_employee_identity_number($1)', [staff.employeeId])))).toBe('ORG_FORBIDDEN');
  });
  it('removing a role grant is audited and visible to admin only', async () => {
    await asUser(admin.userId, (c) => c.query(`delete from role_permissions where role_id = $1 and permission = 'announcements.publish'`, [co.roles.unit_manager]));
    const forAdmin = await asUser(admin.userId, (c) => c.query(`select 1 from audit_log where action = 'role_permission.delete'`));
    expect(forAdmin.rowCount).toBe(1);
    const forStaff = await asUser(staff.userId, (c) => c.query('select 1 from audit_log'));
    expect(forStaff.rowCount).toBe(0);
  });
  it('the encrypted column is not readable through the API by a normal employee', async () => {
    await setOwnIqama('2123456789');
    expect(await errorOf(asUser(staff.userId, (c) => c.query('select identity_number_enc from employees')))).toMatch(/permission denied/);
  });
});
