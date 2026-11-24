import { describe, it, expect, beforeEach } from 'vitest';
import { asService, asUser, db, errorOf, resetDb } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

type Profile = { name: string; birth: string | null; gender: string | null; nat: string | null; email: string | null; cs: string | null; ce: string | null };
const base: Profile = { name: 'سالم أحمد', birth: '1990-05-01', gender: 'male', nat: 'EG', email: 'salem@co.sa', cs: '2024-01-01', ce: '2026-12-31' };

const editProfile = (actor: SeededEmployee, emp: string, p: Partial<Profile> = {}) => {
  const v = { ...base, ...p };
  return asUser(actor.userId, (c) =>
    c.query('select update_employee_profile($1,$2,$3::date,$4,$5,$6,$7::date,$8::date)', [emp, v.name, v.birth, v.gender, v.nat, v.email, v.cs, v.ce]));
};
const myDoc = (actor: SeededEmployee, type: string, num: string, expiry: string | null, entry: string | null = null) =>
  asUser(actor.userId, (c) => c.query('select update_my_document($1,$2,$3::date,$4::date)', [type, num, expiry, entry]));
const hrDoc = (actor: SeededEmployee, emp: string, type: string, num: string, expiry: string | null, entry: string | null = null) =>
  asUser(actor.userId, (c) => c.query('select update_employee_document($1,$2,$3,$4::date,$5::date)', [emp, type, num, expiry, entry]));

describe('profile edits', () => {
  let co: SeededCompany;
  let hr: SeededEmployee;
  let worker: SeededEmployee;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const hrUnit = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية');
    hr = await addEmployee(co, hrUnit, 'hr');
    worker = await addEmployee(co, hrUnit, 'employee');
    await asService((c) => c.query(`update employees set nationality = 'EG' where id = $1`, [worker.employeeId]));
    await hrDoc(hr, worker.employeeId, 'iqama', '2123456789', '2027-01-01');
  });

  it('HR edits name and contract dates', async () => {
    await editProfile(hr, worker.employeeId);
    const r = await db().query('select full_name, email, contract_end::text from employees where id = $1', [worker.employeeId]);
    expect(r.rows[0]).toEqual({ full_name: 'سالم أحمد', email: 'salem@co.sa', contract_end: '2026-12-31' });
  });

  it('validates the profile', async () => {
    expect(await errorOf(editProfile(hr, worker.employeeId, { name: 'س' }))).toBe('ORG_VALIDATION');
    expect(await errorOf(editProfile(hr, worker.employeeId, { cs: '2026-01-01', ce: '2025-01-01' }))).toBe('ORG_VALIDATION');
    expect(await errorOf(editProfile(hr, worker.employeeId, { nat: 'SA' }))).toBe('ORG_VALIDATION'); // iqama holder cannot be Saudi
    expect(await errorOf(editProfile(hr, worker.employeeId, { email: hr.phone.slice(1) + '@test.sa' }))).toBe('ORG_EMAIL_TAKEN');
  });

  it('employee cannot edit own name, directly or via RPC', async () => {
    expect(await errorOf(editProfile(worker, worker.employeeId))).toBe('ORG_FORBIDDEN');
    expect(await errorOf(asUser(worker.userId, (c) => c.query(`update employees set full_name = 'x' where id = $1`, [worker.employeeId]))))
      .toMatch(/permission denied/);
  });

  it('employee renews own iqama: stored encrypted, HR notified', async () => {
    await myDoc(worker, 'iqama', '2987654321', '2028-03-01');
    const r = await db().query('select identity_last4, iqama_expiry::text from employees where id = $1', [worker.employeeId]);
    expect(r.rows[0]).toEqual({ identity_last4: '4321', iqama_expiry: '2028-03-01' });
    const n = await db().query(`select payload from notifications where user_id = $1 and type = 'document_updated'`, [hr.userId]);
    expect(n.rowCount).toBe(1);
    expect(n.rows[0]!.payload.employee_id).toBe(worker.employeeId);
  });

  it('invalid number → ORG_VALIDATION; employee cannot switch to national id', async () => {
    expect(await errorOf(myDoc(worker, 'iqama', '1234', '2028-03-01'))).toBe('ORG_VALIDATION');
    expect(await errorOf(myDoc(worker, 'national_id', '1123456789', null))).toBe('ORG_VALIDATION');
  });

  it('border number converts to iqama by the employee', async () => {
    await hrDoc(hr, worker.employeeId, 'border_number', '3123456789', null, '2025-06-01');
    await myDoc(worker, 'iqama', '2555555555', '2027-06-01');
    const r = await db().query('select identity_type, iqama_expiry::text from employees where id = $1', [worker.employeeId]);
    expect(r.rows[0]).toEqual({ identity_type: 'iqama', iqama_expiry: '2027-06-01' });
  });

  it('employee updates own email', async () => {
    await asUser(worker.userId, (c) => c.query(`select update_my_email('New@Mail.sa')`));
    const r = await db().query('select email from employees where id = $1', [worker.employeeId]);
    expect(r.rows[0]!.email).toBe('new@mail.sa');
    expect(await errorOf(asUser(worker.userId, (c) => c.query(`select update_my_email('bad')`)))).toBe('ORG_VALIDATION');
  });

  it('other company cannot edit', async () => {
    const co2 = await seedCompany();
    const hr2 = await addEmployee(co2, co2.rootId, 'hr');
    expect(await errorOf(editProfile(hr2, worker.employeeId))).toBe('ORG_FORBIDDEN');
  });
});
