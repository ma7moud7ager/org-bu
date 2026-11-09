import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, createAuthUser, resetDb, errorOf, db } from './helpers';
import { DEFAULT_ROLE_GRANTS } from '@orgbu/shared';

async function catalogIds(names: string[]): Promise<string[]> {
  const r = await db().query<{ id: string }>('select id from department_catalog where name_ar = any($1)', [names]);
  return r.rows.map((x) => x.id);
}

function register(userId: string, cr: string, activity: string, selected: string[], phone = '+966550000001', email = 'a@co.sa') {
  return asUser(userId, (c) =>
    c.query<{ id: string }>('select register_company($1,$2,$3,$4,$5,$6,$7,$8) as id', [
      'شركة اختبار', cr, 20, activity, selected, 'مدير الحساب', phone, email,
    ]),
  ).then((r) => r.rows[0]!.id);
}

describe('register_company', () => {
  let user: string;
  beforeEach(async () => {
    await resetDb();
    user = await createAuthUser({ phone: '+966550000001' });
  });

  it('commercial: builds template, roles and admin employee', async () => {
    const sel = await catalogIds(['التسويق', 'المبيعات']);
    const companyId = await register(user, '1010000001', 'commercial', sel);
    const units = await db().query('select type, is_fixed, name from org_units where company_id = $1', [companyId]);
    expect(units.rowCount).toBe(6);
    expect(units.rows.filter((u) => u.is_fixed)).toHaveLength(3);
    expect(units.rows.filter((u) => u.type === 'branch')).toHaveLength(1);
    const roles = await db().query('select system_key from roles where company_id = $1', [companyId]);
    expect(roles.rowCount).toBe(6);
    const emp = await db().query(
      `select r.system_key from employees e join positions p on p.id = e.position_id join roles r on r.id = p.role_id where e.user_id = $1`,
      [user],
    );
    expect(emp.rows[0]!.system_key).toBe('company_admin');
    const can = await asUser(user, (c) =>
      c.query(`select has_permission('structure.manage', company_root($1)) as ok`, [companyId]),
    );
    expect(can.rows[0]!.ok).toBe(true);
    const sub = await db().query('select status from subscriptions where company_id = $1', [companyId]);
    expect(sub.rows[0]!.status).toBe('trial');
  });

  it('role grants match DEFAULT_ROLE_GRANTS exactly', async () => {
    const companyId = await register(user, '1010000007', 'service', []);
    const r = await db().query<{ system_key: string; permission: string; scope: string }>(
      `select r.system_key, rp.permission, rp.scope from roles r join role_permissions rp on rp.role_id = r.id where r.company_id = $1`,
      [companyId],
    );
    const actual = r.rows.map((x) => `${x.system_key}:${x.permission}:${x.scope}`).sort();
    const expected = Object.entries(DEFAULT_ROLE_GRANTS)
      .flatMap(([k, gs]) => gs.map((g) => `${k}:${g.permission}:${g.scope}`))
      .sort();
    expect(actual).toEqual(expected);
  });

  it('service: no branch', async () => {
    const companyId = await register(user, '1010000002', 'service', []);
    const b = await db().query(`select 1 from org_units where company_id = $1 and type = 'branch'`, [companyId]);
    expect(b.rowCount).toBe(0);
  });

  it('rejects duplicate commercial registration', async () => {
    await register(user, '1010000003', 'service', []);
    const other = await createAuthUser({ phone: '+966550000002' });
    expect(await errorOf(register(other, '1010000003', 'service', [], '+966550000002', 'b@co.sa'))).toBe('ORG_CR_TAKEN');
  });

  it('rejects a caller who already belongs to a company', async () => {
    await register(user, '1010000004', 'service', []);
    expect(await errorOf(register(user, '1010000005', 'service', [], '+966550000009', 'z@co.sa'))).toBe('ORG_VALIDATION');
  });

  it('rejects anonymous caller', async () => {
    expect(await errorOf(asUser(null, (c) => c.query(`select register_company('x','1010000006',1,'service','{}','x','+966550000003','c@co.sa')`)))).not.toBeNull();
  });
});
