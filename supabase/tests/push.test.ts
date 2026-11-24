import { describe, it, expect, beforeEach } from 'vitest';
import { asOwner, asService, asUser, db, resetDb } from './helpers';
import { seedCompany, addEmployee } from './fixtures';

describe('push dispatch', () => {
  beforeEach(resetDb);
  it('notification inserts never fail when pg_net or push config is missing', async () => {
    const co = await seedCompany();
    const a = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    const b = await addEmployee(co, co.rootId, 'employee');
    await asUser(a.userId, (c) => c.query(`select publish_announcement('news','عنوان','نص',null,false)`));
    await asOwner((c) => c.query(`insert into private.internal_config (key, value) values ('push_url','https://x.invalid/push'), ('push_secret','s')`));
    await asUser(a.userId, (c) => c.query(`select publish_announcement('news','عنوان 2','نص',null,false)`));
    const n = await db().query(`select count(*)::int as n from notifications where user_id = $1`, [b.userId]);
    expect(n.rows[0]!.n).toBe(2);
    const t = await db().query(`select tgname from pg_trigger where tgname = 'notifications_push'`);
    expect(t.rowCount).toBe(1);
  });
  it('internal_config is not readable by API roles', async () => {
    const co = await seedCompany();
    const a = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    await expect(asUser(a.userId, (c) => c.query('select * from private.internal_config'))).rejects.toThrow(/permission denied/);
  });
});

describe('check_push_secret', () => {
  beforeEach(resetDb);
  it('only the service role can check, and only the stored secret passes', async () => {
    await asOwner((c) => c.query(`insert into private.internal_config (key, value) values ('push_secret','s3cret')`));
    const ok = (s: string) => asService((c) => c.query('select check_push_secret($1) as ok', [s])).then((r) => r.rows[0]!.ok);
    expect(await ok('s3cret')).toBe(true);
    expect(await ok('nope')).toBe(false);
    const co = await seedCompany();
    const a = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    await expect(asUser(a.userId, (c) => c.query(`select check_push_secret('s3cret')`))).rejects.toThrow(/permission denied/);
  });
});
