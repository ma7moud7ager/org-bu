import { describe, it, expect, beforeEach } from 'vitest';
import { asOwner, asService, asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const plusDays = async (n: number) =>
  (await db().query<{ d: string }>(`select (today_riyadh() + $1::int)::text as d`, [n])).rows[0]!.d;

async function vacantPosition(co: SeededCompany, unit: string, role: keyof SeededCompany['roles'] = 'employee', title = 'وظيفة') {
  return asService(async (c) =>
    (await c.query<{ id: string }>(
      `insert into positions (company_id, org_unit_id, title, role_id) values ($1,$2,$3,$4) returning id`,
      [co.companyId, unit, title, co.roles[role]],
    )).rows[0]!.id);
}

type Args = { target?: string | null; unit?: string | null; title?: string | null; role?: string | null; runAt?: string | null };
const transfer = (actor: SeededEmployee, emp: string, a: Args) =>
  asUser(actor.userId, (c) =>
    c.query<{ id: string | null }>('select transfer_employee($1,$2,$3,$4,$5,$6::date) as id', [
      emp, a.target ?? null, a.unit ?? null, a.title ?? null, a.role ?? null, a.runAt ?? null,
    ]),
  ).then((r) => r.rows[0]!.id);

const positionOf = async (emp: string) =>
  (await db().query<{ position_id: string }>('select position_id from employees where id = $1', [emp])).rows[0]!.position_id;
const runDue = () => asOwner((c) => c.query<{ n: number }>('select run_scheduled_actions() as n')).then((r) => r.rows[0]!.n);

describe('transfer_employee', () => {
  let co: SeededCompany;
  let hr: SeededEmployee;
  let bm: SeededEmployee;
  let worker: SeededEmployee;
  let b1: string;
  let b2: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const hrUnit = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية');
    hr = await addEmployee(co, hrUnit, 'hr');
    b1 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 1');
    b2 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 2');
    bm = await addEmployee(co, b1, 'branch_manager', { isManager: true });
    worker = await addEmployee(co, b1, 'employee');
  });

  it('immediate transfer to a vacant position frees the old one', async () => {
    const target = await vacantPosition(co, b2);
    expect(await transfer(hr, worker.employeeId, { target })).toBe(target);
    expect(await positionOf(worker.employeeId)).toBe(target);
    const a = await db().query(`select 1 from audit_log where action = 'employee.transfer' and entity_id = $1`, [worker.employeeId]);
    expect(a.rowCount).toBe(1);
  });

  it('immediate transfer to a new position creates it in the destination unit', async () => {
    const id = await transfer(hr, worker.employeeId, { unit: b2, title: 'كاشير', role: co.roles.employee });
    const p = await db().query('select org_unit_id, title, role_id from positions where id = $1', [id]);
    expect(p.rows[0]).toEqual({ org_unit_id: b2, title: 'كاشير', role_id: co.roles.employee });
    expect(await positionOf(worker.employeeId)).toBe(id);
  });

  it('scheduled transfer runs only when due', async () => {
    const target = await vacantPosition(co, b2);
    expect(await transfer(hr, worker.employeeId, { target, runAt: await plusDays(3) })).toBeNull();
    expect(await runDue()).toBe(0);
    expect(await positionOf(worker.employeeId)).toBe(worker.positionId);
    await db().query(`update scheduled_actions set run_at = today_riyadh() where employee_id = $1`, [worker.employeeId]);
    expect(await runDue()).toBe(1);
    expect(await positionOf(worker.employeeId)).toBe(target);
    const s = await db().query(`select status, executed_at from scheduled_actions where employee_id = $1`, [worker.employeeId]);
    expect(s.rows[0]!.status).toBe('done');
  });

  it('target filled before the run: fails safely and notifies HR', async () => {
    const target = await vacantPosition(co, b2);
    await transfer(hr, worker.employeeId, { target, runAt: await plusDays(3) });
    // someone joins the target position meanwhile
    const other = await addEmployee(co, b2, 'employee');
    await asService((c) => c.query('update employees set position_id = $1 where id = $2', [target, other.employeeId]));
    await db().query(`update scheduled_actions set run_at = today_riyadh() where employee_id = $1`, [worker.employeeId]);
    await runDue();
    expect(await positionOf(worker.employeeId)).toBe(worker.positionId);
    const s = await db().query(`select status, error from scheduled_actions where employee_id = $1`, [worker.employeeId]);
    expect(s.rows[0]!.status).toBe('failed');
    expect(s.rows[0]!.error).toBe('ORG_POSITION_FILLED');
    const n = await db().query(`select payload from notifications where user_id = $1 and type = 'scheduled_failed'`, [hr.userId]);
    expect(n.rowCount).toBe(1);
    expect(n.rows[0]!.payload.employee_id).toBe(worker.employeeId);
  });

  it('scheduled termination is executed by the runner', async () => {
    await asUser(hr.userId, (c) => c.query(`select terminate_employee($1,'resignation','',today_riyadh() + 2)`, [worker.employeeId]));
    await db().query(`update scheduled_actions set run_at = today_riyadh() where employee_id = $1`, [worker.employeeId]);
    expect(await runDue()).toBe(1);
    const e = await db().query('select status, position_id from employees where id = $1', [worker.employeeId]);
    expect(e.rows[0]).toEqual({ status: 'terminated', position_id: null });
  });

  it('rejects filled targets, admin positions for HR, past dates and duplicate schedules', async () => {
    expect(await errorOf(transfer(hr, worker.employeeId, { target: bm.positionId }))).toBe('ORG_POSITION_FILLED');
    const adminSeat = await vacantPosition(co, co.rootId, 'company_admin');
    expect(await errorOf(transfer(hr, worker.employeeId, { target: adminSeat }))).toBe('ORG_FORBIDDEN');
    expect(await errorOf(transfer(hr, worker.employeeId, { unit: b2, title: 'مدير', role: co.roles.company_admin }))).toBe('ORG_FORBIDDEN');
    const t = await vacantPosition(co, b2);
    expect(await errorOf(transfer(hr, worker.employeeId, { target: t, runAt: await plusDays(-1) }))).toBe('ORG_VALIDATION');
    expect(await errorOf(transfer(hr, worker.employeeId, { target: t, unit: b2, title: 'x', role: co.roles.employee }))).toBe('ORG_VALIDATION');
    await transfer(hr, worker.employeeId, { target: t, runAt: await plusDays(2) });
    expect(await errorOf(transfer(hr, worker.employeeId, { target: t, runAt: await plusDays(4) }))).toBe('ORG_VALIDATION');
  });

  it('branch manager and other companies cannot transfer directly', async () => {
    const t = await vacantPosition(co, b1);
    expect(await errorOf(transfer(bm, worker.employeeId, { target: t }))).toBe('ORG_FORBIDDEN');
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect(await errorOf(transfer(hr2, worker.employeeId, { target: t }))).toBe('ORG_FORBIDDEN');
    const foreign = await vacantPosition(co2, co2.rootId);
    expect(await errorOf(transfer(hr, worker.employeeId, { target: foreign }))).toBe('ORG_FORBIDDEN');
  });

  it('cancel_scheduled_action cancels a pending transfer', async () => {
    const t = await vacantPosition(co, b2);
    await transfer(hr, worker.employeeId, { target: t, runAt: await plusDays(2) });
    const id = (await db().query<{ id: string }>('select id from scheduled_actions where employee_id = $1', [worker.employeeId])).rows[0]!.id;
    expect(await errorOf(asUser(bm.userId, (c) => c.query('select cancel_scheduled_action($1)', [id])))).toBe('ORG_FORBIDDEN');
    await asUser(hr.userId, (c) => c.query('select cancel_scheduled_action($1)', [id]));
    expect((await db().query('select status from scheduled_actions where id = $1', [id])).rows[0]!.status).toBe('cancelled');
    expect(await runDue()).toBe(0);
  });
});
