import { describe, it, expect, beforeEach } from 'vitest';
import { asService, asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const plusDays = async (n: number) =>
  (await db().query<{ d: string }>(`select (today_riyadh() + $1::int)::text as d`, [n])).rows[0]!.d;

const submit = (actor: SeededEmployee, type: string, subject: string, payload: object) =>
  asUser(actor.userId, (c) =>
    c.query<{ id: string }>('select submit_request($1,$2,$3::jsonb) as id', [type, subject, JSON.stringify(payload)]),
  ).then((r) => r.rows[0]!.id);

const decide = (actor: SeededEmployee, id: string, decision: string, note: string | null, payload?: object, until?: string) =>
  asUser(actor.userId, (c) =>
    c.query('select decide_request($1,$2,$3,$4::jsonb,$5::date)', [
      id, decision, note, payload ? JSON.stringify(payload) : null, until ?? null,
    ]),
  );

const req = async (id: string) =>
  (await db().query('select status, decision_note, postponed_until::text, payload from requests where id = $1', [id])).rows[0];
const notes = async (user: string, type: string) =>
  (await db().query('select payload from notifications where user_id = $1 and type = $2', [user, type])).rows;

describe('requests engine', () => {
  let co: SeededCompany;
  let admin: SeededEmployee;
  let hr: SeededEmployee;
  let bm: SeededEmployee;
  let worker: SeededEmployee;
  let other: SeededEmployee;
  let b1: string;
  let b2: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const hrUnit = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية');
    hr = await addEmployee(co, hrUnit, 'hr');
    b1 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 1');
    b2 = await addUnit(co.companyId, co.rootId, 'branch', 'فرع 2');
    bm = await addEmployee(co, b1, 'branch_manager', { isManager: true });
    worker = await addEmployee(co, b1, 'employee');
    other = await addEmployee(co, b2, 'employee');
  });

  const termPayload = async (days = 0) => ({ reason: 'dismissal', note: 'غياب متكرر', last_day: await plusDays(days) });

  it('branch manager submits termination for own-branch employee → HR and admin notified', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload());
    expect((await req(id)).status).toBe('pending');
    expect(await notes(hr.userId, 'request_new')).toHaveLength(1);
    expect(await notes(admin.userId, 'request_new')).toHaveLength(1);
    expect(await notes(worker.userId, 'request_new')).toHaveLength(0);
    const ev = await db().query(`select action from request_events where request_id = $1`, [id]);
    expect(ev.rows.map((r) => r.action)).toEqual(['submitted']);
  });

  it('branch manager cannot submit for an employee in another branch', async () => {
    expect(await errorOf(submit(bm, 'termination', other.employeeId, await termPayload()))).toBe('ORG_FORBIDDEN');
    expect(await errorOf(submit(worker, 'termination', other.employeeId, await termPayload()))).toBe('ORG_FORBIDDEN');
  });

  it('validates payloads and duplicates', async () => {
    expect(await errorOf(submit(bm, 'termination', worker.employeeId, { reason: 'x', last_day: await plusDays(1) }))).toBe('ORG_VALIDATION');
    expect(await errorOf(submit(bm, 'termination', worker.employeeId, await termPayload(-1)))).toBe('ORG_VALIDATION');
    expect(await errorOf(submit(bm, 'transfer', worker.employeeId, {}))).toBe('ORG_VALIDATION');
    expect(await errorOf(submit(bm, 'leave', worker.employeeId, {}))).toBe('ORG_VALIDATION');
    await submit(bm, 'termination', worker.employeeId, await termPayload(3));
    expect(await errorOf(submit(bm, 'termination', worker.employeeId, await termPayload(3)))).toBe('ORG_VALIDATION');
  });

  it('HR approves: today → terminated, requester notified', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload());
    await decide(hr, id, 'approve', null);
    expect((await req(id)).status).toBe('approved');
    const e = await db().query('select status from employees where id = $1', [worker.employeeId]);
    expect(e.rows[0]!.status).toBe('terminated');
    const n = await notes(bm.userId, 'request_decided');
    expect(n).toHaveLength(1);
    expect(n[0]!.payload.decision).toBe('approve');
  });

  it('approve with an edited last day schedules with the edit', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload());
    const edited = { ...(await termPayload()), last_day: await plusDays(7) };
    await decide(hr, id, 'approve', 'بعد التسليم', edited);
    const s = await db().query(`select run_at::text from scheduled_actions where employee_id = $1`, [worker.employeeId]);
    expect(s.rows[0]!.run_at).toBe(edited.last_day);
    expect((await req(id)).payload.last_day).toBe(edited.last_day);
  });

  it('transfer request approved moves the employee', async () => {
    const target = await asService(async (c) =>
      (await c.query<{ id: string }>(`insert into positions (company_id, org_unit_id, title, role_id) values ($1,$2,'كاشير',$3) returning id`,
        [co.companyId, b2, co.roles.employee])).rows[0]!.id);
    const id = await submit(bm, 'transfer', worker.employeeId, { target_position: target });
    await decide(hr, id, 'approve', null);
    const e = await db().query('select position_id from employees where id = $1', [worker.employeeId]);
    expect(e.rows[0]!.position_id).toBe(target);
  });

  it('reject needs a note; postpone needs a future date; then still decidable', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload(5));
    expect(await errorOf(decide(hr, id, 'reject', ''))).toBe('ORG_VALIDATION');
    expect(await errorOf(decide(hr, id, 'postpone', null))).toBe('ORG_VALIDATION');
    const until = await plusDays(10);
    await decide(hr, id, 'postpone', 'نراجع بعد الموسم', undefined, until);
    expect(await req(id)).toMatchObject({ status: 'postponed', postponed_until: until });
    await decide(hr, id, 'reject', 'تم حل المشكلة');
    expect(await req(id)).toMatchObject({ status: 'rejected', decision_note: 'تم حل المشكلة' });
    expect(await errorOf(decide(hr, id, 'approve', null))).toBe('ORG_VALIDATION');
  });

  it('only deciders decide; requester can cancel while pending', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload(5));
    expect(await errorOf(decide(bm, id, 'approve', null))).toBe('ORG_FORBIDDEN');
    expect(await errorOf(asUser(hr.userId, (c) => c.query('select cancel_request($1)', [id])))).toBe('ORG_FORBIDDEN');
    await asUser(bm.userId, (c) => c.query('select cancel_request($1)', [id]));
    expect((await req(id)).status).toBe('cancelled');
    expect(await errorOf(asUser(bm.userId, (c) => c.query('select cancel_request($1)', [id])))).toBe('ORG_VALIDATION');
  });

  it('visibility: requester and deciders see the request, others do not', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload(5));
    const seen = (u: SeededEmployee) => asUser(u.userId, (c) => c.query('select id from requests')).then((r) => r.rows.map((x) => x.id));
    expect(await seen(bm)).toEqual([id]);
    expect(await seen(hr)).toEqual([id]);
    expect(await seen(worker)).toEqual([]);
    expect(await seen(other)).toEqual([]);
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect(await seen(hr2)).toEqual([]);
  });

  it('approving after the subject was already terminated → ORG_VALIDATION, request stays pending', async () => {
    const id = await submit(bm, 'termination', worker.employeeId, await termPayload(5));
    await asUser(hr.userId, (c) => c.query(`select terminate_employee($1,'resignation','',today_riyadh())`, [worker.employeeId]));
    expect(await errorOf(decide(hr, id, 'approve', null))).toBe('ORG_VALIDATION');
    expect((await req(id)).status).toBe('pending');
  });
});
