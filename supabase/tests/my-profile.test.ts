import { describe, it, expect, beforeEach } from 'vitest';
import { asService, asUser, db, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const profile = (u: SeededEmployee) => asUser(u.userId, (c) => c.query('select my_profile() as p')).then((r) => r.rows[0]!.p);
const managerOf = (u: SeededEmployee, emp: string) =>
  asUser(u.userId, (c) => c.query('select direct_manager($1) as m', [emp])).then((r) => r.rows[0]!.m);

describe('my_profile / direct_manager', () => {
  let co: SeededCompany;
  let admin: SeededEmployee;
  let deptMgr: SeededEmployee;
  let worker: SeededEmployee;
  let dept: string;
  let section: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    dept = await addUnit(co.companyId, co.rootId, 'department', 'التسويق');
    section = await addUnit(co.companyId, dept, 'section', 'التصميم');
    deptMgr = await addEmployee(co, dept, 'unit_manager', { isManager: true });
    worker = await addEmployee(co, section, 'employee');
  });

  it('section employee (no section manager) reports to the department manager', async () => {
    expect(await managerOf(worker, worker.employeeId)).toBe(deptMgr.employeeId);
    expect(await managerOf(deptMgr, deptMgr.employeeId)).toBe(admin.employeeId);
    expect(await managerOf(admin, admin.employeeId)).toBeNull();
  });

  it('vacant manager position → next manager up', async () => {
    await asService((c) => c.query(`update employees set status = 'terminated', position_id = null where id = $1`, [deptMgr.employeeId]));
    expect(await managerOf(worker, worker.employeeId)).toBe(admin.employeeId);
  });

  it('profile shows job and manager; phone only when the manager position allows it', async () => {
    const p = await profile(worker);
    expect(p.me.full_name).toBe(`موظف ${worker.phone}`);
    expect(p.job).toMatchObject({ title: 'employee', unit_name: 'التصميم', role_name: 'employee' });
    expect(p.manager.name).toBe(`موظف ${deptMgr.phone}`);
    expect(p.manager.phone).toBeUndefined();
    await db().query('update positions set show_phone_to_reports = true where id = $1', [deptMgr.positionId]);
    expect((await profile(worker)).manager.phone).toBe(deptMgr.phone);
    expect(p.requests).toEqual([]);
  });

  it('shows branch name and my submitted requests', async () => {
    const branch = await addUnit(co.companyId, co.rootId, 'branch', 'فرع العليا');
    const bm = await addEmployee(co, branch, 'branch_manager', { isManager: true });
    const w2 = await addEmployee(co, branch, 'employee');
    await asUser(bm.userId, (c) =>
      c.query(`select submit_request('termination',$1,jsonb_build_object('reason','resignation','last_day',today_riyadh()+3))`, [w2.employeeId]));
    const p = await profile(bm);
    expect(p.job.branch_name).toBe('فرع العليا');
    expect(p.requests).toHaveLength(1);
    expect(p.requests[0]).toMatchObject({ type: 'termination', status: 'pending', subject_name: `موظف ${w2.phone}` });
  });

  it('never crosses companies', async () => {
    const co2 = await seedCompany();
    const other = await addEmployee(co2, co2.rootId, 'company_admin', { isManager: true });
    expect(await managerOf(other, worker.employeeId)).toBeNull();
    expect((await profile(other)).me.id).toBe(other.employeeId);
  });
});
