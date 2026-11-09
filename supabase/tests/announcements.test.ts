import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, resetDb, errorOf, db } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

describe('announcements and notifications', () => {
  let co: SeededCompany, admin: SeededEmployee, hr: SeededEmployee, umD: SeededEmployee, inD: SeededEmployee, inS: SeededEmployee, outside: SeededEmployee;
  let D: string, S: string, X: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const HR = await addUnit(co.companyId, co.rootId, 'department', 'الموارد البشرية', true);
    D = await addUnit(co.companyId, co.rootId, 'department', 'التسويق');
    S = await addUnit(co.companyId, D, 'section', 'الأداء');
    X = await addUnit(co.companyId, co.rootId, 'department', 'المبيعات');
    hr = await addEmployee(co, HR, 'hr');
    umD = await addEmployee(co, D, 'unit_manager', { isManager: true });
    inD = await addEmployee(co, D, 'employee');
    inS = await addEmployee(co, S, 'employee');
    outside = await addEmployee(co, X, 'employee');
  });

  const publish = (user: string, audience: string[] | null, kind = 'news') =>
    asUser(user, (c) => c.query<{ id: string }>(`select publish_announcement($1, 'عنوان', 'نص الخبر', $2) as id`, [kind, audience])).then((r) => r.rows[0]!.id);
  const notifCount = async (userId: string) =>
    (await db().query(`select 1 from notifications where user_id = $1 and type = 'announcement'`, [userId])).rowCount;

  it('company-wide announcement notifies every active employee', async () => {
    await publish(hr.userId, null, 'decision');
    for (const e of [admin, hr, umD, inD, inS, outside]) expect(await notifCount(e.userId)).toBe(1);
  });
  it('unit announcement reaches the unit subtree only', async () => {
    const id = await publish(umD.userId, [D]);
    expect(await notifCount(inD.userId)).toBe(1);
    expect(await notifCount(inS.userId)).toBe(1);
    expect(await notifCount(outside.userId)).toBe(0);
    const seenOut = await asUser(outside.userId, (c) => c.query('select 1 from announcements where id = $1', [id]));
    expect(seenOut.rowCount).toBe(0);
    const seenIn = await asUser(inS.userId, (c) => c.query('select 1 from announcements where id = $1', [id]));
    expect(seenIn.rowCount).toBe(1);
  });
  it('unit manager cannot publish company-wide', async () => {
    expect(await errorOf(publish(umD.userId, null))).toBe('ORG_FORBIDDEN');
  });
  it('unit manager cannot publish to another unit', async () => {
    expect(await errorOf(publish(umD.userId, [X]))).toBe('ORG_FORBIDDEN');
  });
  it('users only see their own notifications', async () => {
    await publish(hr.userId, null);
    const r = await asUser(inD.userId, (c) => c.query('select user_id from notifications'));
    expect(r.rows.every((x) => x.user_id === inD.userId)).toBe(true);
    expect(r.rowCount).toBe(1);
  });
  it('mark read is idempotent', async () => {
    const id = await publish(hr.userId, null);
    await asUser(inD.userId, (c) => c.query('select mark_announcement_read($1)', [id]));
    await asUser(inD.userId, (c) => c.query('select mark_announcement_read($1)', [id]));
    const r = await db().query('select 1 from announcement_reads where announcement_id = $1', [id]);
    expect(r.rowCount).toBe(1);
  });
  it('employee cannot publish', async () => {
    expect(await errorOf(publish(inD.userId, [D]))).toBe('ORG_FORBIDDEN');
  });
});
