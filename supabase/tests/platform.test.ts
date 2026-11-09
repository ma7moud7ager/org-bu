import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb, errorOf } from './helpers';

describe('platform tables', () => {
  let user: string;
  let admin: string;
  beforeEach(async () => {
    await resetDb();
    user = await createAuthUser();
    admin = await createAuthUser();
    await asService((c) => c.query('insert into platform_admins (user_id) values ($1)', [admin]));
    await asService((c) =>
      c.query(`insert into plans (name, price_monthly, price_yearly, max_employees, modules) values ('أساسية', 99, 990, 25, '{core}')`),
    );
  });

  it('normal user can read active plans', async () => {
    const n = await asUser(user, (c) => c.query('select * from plans'));
    expect(n.rowCount).toBe(1);
  });
  it('normal user cannot insert plans', async () => {
    const err = await errorOf(asUser(user, (c) => c.query(`insert into plans (name, price_monthly, price_yearly, max_employees) values ('x',1,1,1)`)));
    expect(err).toMatch(/row-level security/);
  });
  it('platform admin can insert plans', async () => {
    const r = await asUser(admin, (c) => c.query(`insert into plans (name, price_monthly, price_yearly, max_employees) values ('x',1,1,1)`));
    expect(r.rowCount).toBe(1);
  });
  it('catalog has exactly 3 fixed departments', async () => {
    const r = await asUser(user, (c) => c.query('select * from department_catalog where is_fixed'));
    expect(r.rowCount).toBe(3);
  });
  it('anon cannot read plans', async () => {
    const r = await asUser(null, (c) => c.query('select * from plans'));
    expect(r.rowCount).toBe(0);
  });
});
