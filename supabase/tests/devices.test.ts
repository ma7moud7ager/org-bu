import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const register = (u: SeededEmployee, deviceId: string, token: string | null = null) =>
  asUser(u.userId, (c) => c.query<{ r: string }>(`select register_device($1,'android','Pixel 8',$2) as r`, [deviceId, token])).then((r) => r.rows[0]!.r);
const devices = async (emp: string) =>
  (await db().query(`select device_id, status, push_token from employee_devices where employee_id = $1 order by bound_at`, [emp])).rows;
const openChange = async (emp: string) =>
  (await db().query(`select id, payload from requests where subject_employee_id = $1 and type = 'device_change' and status = 'pending'`, [emp])).rows;

describe('device binding', () => {
  let co: SeededCompany;
  let hr: SeededEmployee;
  let w: SeededEmployee;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const hrUnit = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية');
    hr = await addEmployee(co, hrUnit, 'hr');
    const b = await addUnit(co.companyId, co.rootId, 'branch', 'فرع');
    w = await addEmployee(co, b, 'employee');
  });

  it('binds the first phone, then updates token on the same phone', async () => {
    expect(await register(w, 'dev-A', 't1')).toBe('bound');
    expect(await register(w, 'dev-A', 't2')).toBe('ok');
    expect(await devices(w.employeeId)).toEqual([{ device_id: 'dev-A', status: 'active', push_token: 't2' }]);
  });

  it('second phone → mismatch, one device_change request, HR notified, no token stored', async () => {
    await register(w, 'dev-A', 't1');
    expect(await register(w, 'dev-B', 'tB')).toBe('mismatch');
    expect(await register(w, 'dev-B', 'tB')).toBe('mismatch');
    const reqs = await openChange(w.employeeId);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.payload.device_id).toBe('dev-B');
    const n = await db().query(`select payload from notifications where user_id = $1 and type = 'request_new'`, [hr.userId]);
    expect(n.rows.map((r) => r.payload.type)).toEqual(['device_change']);
    expect(await devices(w.employeeId)).toEqual([{ device_id: 'dev-A', status: 'active', push_token: 't1' }]);
  });

  it('HR approval rebinds to the requested phone even if another phone was bound meanwhile', async () => {
    await register(w, 'dev-A');
    await register(w, 'dev-B');
    const id = (await openChange(w.employeeId))[0]!.id;
    await asUser(hr.userId, (c) => c.query('select unbind_device($1)', [w.employeeId]));
    expect(await register(w, 'dev-C')).toBe('bound');
    await asUser(hr.userId, (c) => c.query(`select decide_request($1,'approve',null)`, [id]));
    const active = (await devices(w.employeeId)).filter((d) => d.status === 'active');
    expect(active.map((d) => d.device_id)).toEqual(['dev-B']);
    expect(await register(w, 'dev-B')).toBe('ok');
  });

  it('rejecting keeps the old phone', async () => {
    await register(w, 'dev-A');
    await register(w, 'dev-B');
    const id = (await openChange(w.employeeId))[0]!.id;
    await asUser(hr.userId, (c) => c.query(`select decide_request($1,'reject','غير مسموح')`, [id]));
    expect(await register(w, 'dev-A')).toBe('ok');
  });

  it('unbind lets the next phone bind; only employees.edit can unbind', async () => {
    await register(w, 'dev-A');
    expect(await errorOf(asUser(w.userId, (c) => c.query('select unbind_device($1)', [w.employeeId])))).toBe('ORG_FORBIDDEN');
    await asUser(hr.userId, (c) => c.query('select unbind_device($1)', [w.employeeId]));
    expect(await register(w, 'dev-Z')).toBe('bound');
  });

  it('termination revokes the device', async () => {
    await register(w, 'dev-A');
    await asUser(hr.userId, (c) => c.query(`select terminate_employee($1,'resignation','',today_riyadh())`, [w.employeeId]));
    expect((await devices(w.employeeId))[0]!.status).toBe('revoked');
    expect(await errorOf(register(w, 'dev-A'))).toBe('ORG_FORBIDDEN');
  });

  it('device_change cannot be submitted directly; validation of inputs', async () => {
    expect(await errorOf(asUser(w.userId, (c) =>
      c.query(`select submit_request('device_change',$1,'{"device_id":"x"}'::jsonb)`, [w.employeeId])))).toBe('ORG_VALIDATION');
    expect(await errorOf(asUser(w.userId, (c) => c.query(`select register_device('', 'android', null, null)`)))).toBe('ORG_VALIDATION');
    expect(await errorOf(asUser(w.userId, (c) => c.query(`select register_device('dev-1', 'windows', null, null)`)))).toBe('ORG_VALIDATION');
  });

  it('my_device / employee_device and company isolation', async () => {
    await register(w, 'dev-A');
    await register(w, 'dev-B');
    const mine = await asUser(w.userId, (c) => c.query('select my_device() as d')).then((r) => r.rows[0]!.d);
    expect(mine).toMatchObject({ status: 'active', device_id: 'dev-A', model: 'Pixel 8', pending_change: true });
    const hrView = await asUser(hr.userId, (c) => c.query('select employee_device($1) as d', [w.employeeId])).then((r) => r.rows[0]!.d);
    expect(hrView).toMatchObject({ device_id: 'dev-A', model: 'Pixel 8' });
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect(await errorOf(asUser(hr2.userId, (c) => c.query('select unbind_device($1)', [w.employeeId])))).toBe('ORG_FORBIDDEN');
    expect(await asUser(hr2.userId, (c) => c.query('select count(*)::int as n from employee_devices')).then((r) => r.rows[0]!.n)).toBe(0);
    expect(await errorOf(asUser(hr2.userId, (c) => c.query('select employee_device($1)', [w.employeeId])))).toBe('ORG_FORBIDDEN');
  });
});

describe('push tokens are private', () => {
  beforeEach(resetDb);
  it('authenticated users cannot select push_token', async () => {
    const co = await seedCompany();
    const w = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    await asUser(w.userId, (c) => c.query(`select register_device('dev-A','android',null,'secret-token')`));
    expect(await errorOf(asUser(w.userId, (c) => c.query('select push_token from employee_devices')))).toMatch(/permission denied/);
    const r = await asUser(w.userId, (c) => c.query('select device_id from employee_devices'));
    expect(r.rows).toEqual([{ device_id: 'dev-A' }]);
  });
});
