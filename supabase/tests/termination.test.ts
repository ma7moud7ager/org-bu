import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const today = async () => (await db().query<{ d: string }>(`select today_riyadh()::text as d`)).rows[0]!.d;
const plusDays = async (n: number) =>
  (await db().query<{ d: string }>(`select (today_riyadh() + $1::int)::text as d`, [n])).rows[0]!.d;

const terminate = (actor: SeededEmployee, target: string, lastDay: string, reason = 'resignation') =>
  asUser(actor.userId, (c) =>
    c.query('select terminate_employee($1, $2, $3, $4::date)', [target, reason, 'ملاحظة', lastDay]),
  );

const row = async (id: string) =>
  (await db().query(`select status, position_id, termination_reason, last_working_day::text, terminated_at
                     from employees where id = $1`, [id])).rows[0];

describe('terminate_employee', () => {
  let co: SeededCompany;
  let admin: SeededEmployee;
  let hr: SeededEmployee;
  let branch: string;
  let bm: SeededEmployee;
  let worker: SeededEmployee;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const hrUnit = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية');
    hr = await addEmployee(co, hrUnit, 'hr');
    branch = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 1');
    bm = await addEmployee(co, branch, 'branch_manager', { isManager: true });
    worker = await addEmployee(co, branch, 'employee');
  });

  it('HR terminates today: terminated, position vacant, audit row', async () => {
    await terminate(hr, worker.employeeId, await today());
    const r = await row(worker.employeeId);
    expect(r.status).toBe('terminated');
    expect(r.position_id).toBeNull();
    expect(r.termination_reason).toBe('resignation');
    expect(r.terminated_at).not.toBeNull();
    const pos = await db().query('select id from positions where id = $1', [worker.positionId]);
    expect(pos.rowCount).toBe(1);
    const a = await db().query(`select 1 from audit_log where action = 'employee.terminate' and entity_id = $1`, [worker.employeeId]);
    expect(a.rowCount).toBe(1);
  });

  it('future last day: still active, scheduled action, then cancellable', async () => {
    const d = await plusDays(10);
    await terminate(hr, worker.employeeId, d, 'contract_end');
    const r = await row(worker.employeeId);
    expect(r.status).toBe('active');
    expect(r.last_working_day).toBe(d);
    const s = await db().query(`select run_at::text, status from scheduled_actions where employee_id = $1 and kind = 'termination'`, [worker.employeeId]);
    expect(s.rows).toEqual([{ run_at: d, status: 'scheduled' }]);
    expect(await errorOf(terminate(hr, worker.employeeId, d))).toBe('ORG_VALIDATION'); // already scheduled

    await asUser(hr.userId, (c) => c.query('select cancel_termination($1)', [worker.employeeId]));
    const after = await row(worker.employeeId);
    expect(after.last_working_day).toBeNull();
    expect(after.termination_reason).toBeNull();
    const s2 = await db().query(`select status from scheduled_actions where employee_id = $1`, [worker.employeeId]);
    expect(s2.rows[0]!.status).toBe('cancelled');
  });

  it('cancel_termination without a scheduled termination → ORG_VALIDATION', async () => {
    expect(await errorOf(asUser(hr.userId, (c) => c.query('select cancel_termination($1)', [worker.employeeId])))).toBe('ORG_VALIDATION');
  });

  it('branch manager cannot terminate directly', async () => {
    expect(await errorOf(terminate(bm, worker.employeeId, await today()))).toBe('ORG_FORBIDDEN');
  });

  it('rejects past dates, unknown reasons, self and the last admin', async () => {
    expect(await errorOf(terminate(hr, worker.employeeId, await plusDays(-1)))).toBe('ORG_VALIDATION');
    expect(await errorOf(terminate(hr, worker.employeeId, await today(), 'fired'))).toBe('ORG_VALIDATION');
    expect(await errorOf(terminate(hr, hr.employeeId, await today()))).toBe('ORG_VALIDATION');
    expect(await errorOf(terminate(hr, admin.employeeId, await today()))).toBe('ORG_VALIDATION');
  });

  it('a second admin can be terminated by an admin, never by HR', async () => {
    const admin2 = await addEmployee(co, co.rootId, 'company_admin');
    expect(await errorOf(terminate(hr, admin2.employeeId, await today()))).toBe('ORG_FORBIDDEN');
    await terminate(admin, admin2.employeeId, await today());
    expect((await row(admin2.employeeId)).status).toBe('terminated');
  });

  it('other company cannot terminate', async () => {
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect(await errorOf(terminate(hr2, worker.employeeId, await today()))).toBe('ORG_FORBIDDEN');
  });

  it("terminated user's current_employee() is null", async () => {
    await terminate(hr, worker.employeeId, await today());
    const r = await asUser(worker.userId, (c) => c.query('select (current_employee()).id as id'));
    expect(r.rows[0]!.id).toBeNull();
  });
});
