import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, resetDb, errorOf, db } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('org unit rules', () => {
  let co: SeededCompany;
  let admin: SeededEmployee, staffS: SeededEmployee, hrStaff: SeededEmployee, bm: SeededEmployee;
  let B1: string, B2: string, D: string, S: string, HR: string, FIN: string, R: string;

  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    B1 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 1');
    B2 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 2');
    D = await addUnit(co.companyId, B1, 'department', 'إدارة');
    S = await addUnit(co.companyId, D, 'section', 'قسم');
    HR = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية', true);
    FIN = await addUnit(co.companyId, co.rootId, 'department', 'المالية', true);
    R = await addUnit(co.companyId, co.rootId, 'department', 'بديلة');
    staffS = await addEmployee(co, S, 'employee');
    hrStaff = await addEmployee(co, HR, 'hr');
    bm = await addEmployee(co, B1, 'branch_manager', { isManager: true });
  });

  const del = (user: string, unit: string, repl: string | null = null) =>
    asUser(user, (c) => c.query('select delete_org_unit($1, $2)', [unit, repl]));

  it('rejects moving a branch under its own section', async () => {
    expect(await errorOf(asUser(admin.userId, (c) => c.query('update org_units set parent_id = $1 where id = $2', [S, B1])))).toBe('ORG_UNIT_CYCLE');
  });
  it('rejects deleting a unit whose employee sits in a nested section', async () => {
    expect(await errorOf(del(admin.userId, D))).toBe('ORG_UNIT_NOT_EMPTY');
  });
  it('deletes with replacement and moves the subtree', async () => {
    await del(admin.userId, D, R);
    const r = await db().query('select unit_path(position_unit($1)) as p', [staffS.positionId]);
    expect(r.rows[0]!.p).toContain(R);
    const gone = await db().query('select 1 from org_units where id = $1', [D]);
    expect(gone.rowCount).toBe(0);
  });
  it('rejects replacement inside the deleted subtree', async () => {
    expect(await errorOf(del(admin.userId, D, S))).toBe('ORG_VALIDATION');
  });
  it('rejects deleting an empty fixed unit', async () => {
    expect(await errorOf(del(admin.userId, FIN))).toBe('ORG_UNIT_FIXED');
  });
  it('fixed unit with employees can be replaced', async () => {
    await del(admin.userId, HR, R);
    const r = await db().query('select position_unit($1) as u', [hrStaff.positionId]);
    expect(r.rows[0]!.u).toBe(R);
  });
  it('root can never be deleted', async () => {
    expect(await errorOf(del(admin.userId, co.rootId, R))).toBe('ORG_UNIT_FIXED');
  });
  it('branch manager cannot create units (no structure.manage)', async () => {
    expect(await errorOf(asUser(bm.userId, (c) => c.query(`select create_org_unit($1, 'department', 'x')`, [B2])))).toBe('ORG_FORBIDDEN');
  });
  it('hr can create a unit', async () => {
    const r = await asUser(hrStaff.userId, (c) => c.query(`select create_org_unit($1, 'section', 'قسم جديد') as id`, [D]));
    expect(r.rows[0]!.id).toBeTruthy();
  });
  it('direct delete is not allowed', async () => {
    expect(await errorOf(asUser(admin.userId, (c) => c.query('delete from org_units where id = $1', [R])))).toMatch(/permission denied/);
  });
  it('cannot move a unit under another company', async () => {
    const other = await seedCompany();
    expect(await errorOf(asUser(admin.userId, (c) => c.query('update org_units set parent_id = $1 where id = $2', [other.rootId, R])))).not.toBeNull();
  });
});
