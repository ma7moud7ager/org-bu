import { describe, it, expect, beforeEach } from 'vitest';
import { asService, asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

const B = { lat: 24.7, lng: 46.6 };
const ROOT = { lat: 24.8, lng: 46.7 };
type Opt = { lat?: number; lng?: number; acc?: number; mock?: boolean; bio?: boolean; dev?: string };
const record = (u: SeededEmployee, kind: string, o: Opt = {}) =>
  asUser(u.userId, (c) => c.query<{ r: { result: string; reason: string | null; distance_m: number } }>(
    'select record_attendance($1,$2,$3,$4,$5,$6,$7) as r',
    [kind, o.lat ?? B.lat, o.lng ?? B.lng, o.acc ?? 10, o.mock ?? false, o.bio ?? true, o.dev ?? 'dev-A'],
  )).then((r) => r.rows[0]!.r);
const bind = (u: SeededEmployee, dev = 'dev-A') => asUser(u.userId, (c) => c.query(`select register_device($1,'android',null,null)`, [dev]));
const setLoc = (u: SeededEmployee, unit: string, p: { lat: number; lng: number } | null, radius = 100) =>
  asUser(u.userId, (c) => c.query('select set_unit_location($1,$2,$3,$4)', [unit, p?.lat ?? null, p?.lng ?? null, radius]));

describe('attendance', () => {
  let co: SeededCompany;
  let admin: SeededEmployee;
  let hr: SeededEmployee;
  let bm: SeededEmployee;
  let w: SeededEmployee;
  let office: SeededEmployee;
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
    const sec = await addUnit(co.companyId, b1, 'section', 'الكاشير');
    w = await addEmployee(co, sec, 'employee');
    office = await addEmployee(co, hrUnit, 'employee');
    await setLoc(hr, b1, B);
    await setLoc(hr, co.rootId, ROOT);
    await bind(w);
    await bind(office);
  });

  it('accepts inside the branch fence and alternates in/out', async () => {
    expect(await record(w, 'in')).toMatchObject({ result: 'accepted', reason: null });
    expect(await record(w, 'out', { lat: 24.70089 })).toMatchObject({ result: 'accepted' });
    expect(await record(w, 'in')).toMatchObject({ result: 'accepted' });
    const n = await db().query(`select count(*)::int as n from attendance_records where employee_id = $1`, [w.employeeId]);
    expect(n.rows[0]!.n).toBe(3);
  });

  it('section employee uses the branch fence; head-office employee uses the root fence', async () => {
    expect((await record(w, 'in', ROOT)).reason).toBe('outside');
    expect((await record(office, 'in', ROOT)).result).toBe('accepted');
    expect((await record(office, 'out', B)).reason).toBe('outside');
  });

  it('rejects in the documented order and stores every attempt', async () => {
    expect((await record(w, 'in', { dev: 'dev-X', bio: false })).reason).toBe('device');
    expect((await record(w, 'in', { bio: false, mock: true })).reason).toBe('biometric');
    expect((await record(w, 'in', { mock: true, acc: 500 })).reason).toBe('mock');
    expect((await record(w, 'in', { acc: 101 })).reason).toBe('accuracy');
    expect((await record(w, 'in', { lat: 24.7009 })).reason).toBe('outside');
    expect((await record(w, 'out')).reason).toBe('sequence');
    const r = await db().query(`select result, reason from attendance_records where employee_id = $1 order by at`, [w.employeeId]);
    expect(r.rows.map((x) => x.reason)).toEqual(['device', 'biometric', 'mock', 'accuracy', 'outside', 'sequence']);
  });

  it('boundaries: accuracy 100 and just-inside distance are accepted', async () => {
    expect((await record(w, 'in', { acc: 100, lat: 24.70089 })).result).toBe('accepted');
    expect((await record(w, 'in')).reason).toBe('sequence');
  });

  it('no fence configured → no_location', async () => {
    await setLoc(hr, co.rootId, null);
    expect((await record(office, 'in', ROOT)).reason).toBe('no_location');
  });

  it('rejection notifies the employee and the direct manager', async () => {
    await record(w, 'in', { lat: 25 });
    for (const u of [w, bm]) {
      const n = await db().query(`select payload from notifications where user_id = $1 and type = 'attendance_rejected'`, [u.userId]);
      expect(n.rows).toHaveLength(1);
      expect(n.rows[0]!.payload).toMatchObject({ reason: 'outside', kind: 'in' });
    }
  });

  it('transfer to another branch switches the fence immediately', async () => {
    await setLoc(hr, b2, { lat: 21.5, lng: 39.2 });
    const target = await asService(async (c) =>
      (await c.query<{ id: string }>(`insert into positions (company_id, org_unit_id, title, role_id) values ($1,$2,'كاشير',$3) returning id`,
        [co.companyId, b2, co.roles.employee])).rows[0]!.id);
    await asUser(hr.userId, (c) => c.query('select transfer_employee($1,$2,null,null,null,null)', [w.employeeId, target]));
    expect((await record(w, 'in')).reason).toBe('outside');
    expect((await record(w, 'in', { lat: 21.5, lng: 39.2 })).result).toBe('accepted');
  });

  it('terminated employee cannot record', async () => {
    await asUser(hr.userId, (c) => c.query(`select terminate_employee($1,'resignation','',today_riyadh())`, [w.employeeId]));
    expect(await errorOf(record(w, 'in'))).toBe('ORG_FORBIDDEN');
  });

  it('set_unit_location needs structure.manage and valid values', async () => {
    expect(await errorOf(setLoc(bm, b1, B))).toBe('ORG_FORBIDDEN');
    expect(await errorOf(setLoc(hr, b1, { lat: 95, lng: 46 }))).toBe('ORG_VALIDATION');
    expect(await errorOf(setLoc(hr, b1, B, 5))).toBe('ORG_VALIDATION');
  });

  it('attendance_day: HR sees everyone, branch manager only the branch; my_attendance_today', async () => {
    await record(w, 'in');
    await record(office, 'in', { lat: 30 });
    const day = (u: SeededEmployee) =>
      asUser(u.userId, (c) => c.query('select attendance_day(today_riyadh(), null) as d')).then((r) => r.rows[0]!.d as Array<Record<string, unknown>>);
    const hrRows = await day(hr);
    expect(hrRows.map((r) => r.employee_id).sort()).toEqual([admin, hr, bm, w, office].map((e) => e.employeeId).sort());
    const wRow = hrRows.find((r) => r.employee_id === w.employeeId)!;
    expect(wRow.first_in).not.toBeNull();
    expect(hrRows.find((r) => r.employee_id === office.employeeId)!.rejected).toHaveLength(1);
    expect((await day(bm)).map((r) => r.employee_id).sort()).toEqual([bm.employeeId, w.employeeId].sort());
    const mine = await asUser(w.userId, (c) => c.query('select my_attendance_today() as d')).then((r) => r.rows[0]!.d);
    expect(mine).toMatchObject({ next_kind: 'out', fence_configured: true });
    expect(mine.records).toHaveLength(1);
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect((await day(hr2)).map((r) => r.employee_id)).toEqual([hr2.employeeId]);
  });
});
