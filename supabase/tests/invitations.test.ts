import { describe, it, expect, beforeEach } from 'vitest';
import { asUser, asService, createAuthUser, resetDb, errorOf, db } from './helpers';
import { seedCompany, addUnit, addEmployee, type SeededCompany, type SeededEmployee } from './fixtures';

async function emptyPosition(co: SeededCompany, unit: string, title = 'أخصائي تسويق'): Promise<string> {
  return asService(async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into positions (company_id, org_unit_id, title, role_id) values ($1, $2, $3, $4) returning id`,
      [co.companyId, unit, title, co.roles.employee],
    );
    return r.rows[0]!.id;
  });
}

const invite = (user: string, position: string, ttl = 7) =>
  asUser(user, (c) => c.query<{ t: string }>('select create_invitation($1, $2, $3) as t', [position, 'candidate@x.sa', ttl])).then((r) => r.rows[0]!.t);

const accept = (user: string, token: string, email = 'new@x.sa') =>
  asUser(user, (c) =>
    c.query<{ id: string }>(
      `select accept_invitation($1, 'موظف جديد', '1995-05-05', 'male', 'EG', 'iqama', '2123456789', '2030-01-01', null, $2) as id`,
      [token, email],
    ),
  ).then((r) => r.rows[0]!.id);

describe('invitations', () => {
  let co: SeededCompany, admin: SeededEmployee, um: SeededEmployee, M: string, pos: string;
  beforeEach(async () => {
    await resetDb();
    co = await seedCompany();
    admin = await addEmployee(co, co.rootId, 'company_admin', { isManager: true });
    M = await addUnit(co.companyId, co.rootId, 'department', 'التسويق');
    um = await addEmployee(co, M, 'unit_manager', { isManager: true });
    pos = await emptyPosition(co, M);
  });

  it('stores only the hash of the token', async () => {
    const t = await invite(admin.userId, pos);
    const r = await db().query(`select 1 from invitations where token_hash = encode(extensions.digest($1, 'sha256'), 'hex')`, [t]);
    expect(r.rowCount).toBe(1);
    const raw = await db().query('select 1 from invitations where token_hash = $1', [t]);
    expect(raw.rowCount).toBe(0);
  });
  it('anon can preview an invitation', async () => {
    const t = await invite(admin.userId, pos);
    const r = await asUser(null, (c) => c.query('select * from preview_invitation($1)', [t]));
    expect(r.rows[0]!.position_title).toBe('أخصائي تسويق');
  });
  it('accepting links the employee to the position', async () => {
    const t = await invite(admin.userId, pos);
    const u = await createAuthUser({ phone: '+966551110001' });
    const empId = await accept(u, t);
    const e = await db().query('select position_id, phone, identity_last4 from employees where id = $1', [empId]);
    expect(e.rows[0]).toMatchObject({ position_id: pos, phone: '+966551110001', identity_last4: '6789' });
    const i = await db().query('select used_at from invitations where position_id = $1', [pos]);
    expect(i.rows[0]!.used_at).not.toBeNull();
  });
  it('second accept fails as used', async () => {
    const t = await invite(admin.userId, pos);
    await accept(await createAuthUser({ phone: '+966551110002' }), t);
    expect(await errorOf(accept(await createAuthUser({ phone: '+966551110003' }), t, 'b@x.sa'))).toBe('ORG_INVITE_USED');
  });
  it('concurrent accepts: exactly one wins', async () => {
    const t = await invite(admin.userId, pos);
    const u1 = await createAuthUser({ phone: '+966551110004' });
    const u2 = await createAuthUser({ phone: '+966551110005' });
    const results = await Promise.allSettled([accept(u1, t, 'c1@x.sa'), accept(u2, t, 'c2@x.sa')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('expired invitation is rejected', async () => {
    const t = await invite(admin.userId, pos);
    await db().query(`update invitations set expires_at = now() - interval '1 minute'`);
    expect(await errorOf(accept(await createAuthUser({ phone: '+966551110006' }), t))).toBe('ORG_INVITE_EXPIRED');
  });
  it('cannot invite to a filled position', async () => {
    expect(await errorOf(invite(admin.userId, um.positionId))).toBe('ORG_POSITION_FILLED');
  });
  it('rejects a phone already used by another employee', async () => {
    const t = await invite(admin.userId, pos);
    await db().query('update auth.users set phone = null where phone = $1', [um.phone]);
    const u = await createAuthUser({ phone: um.phone });
    expect(await errorOf(accept(u, t))).toBe('ORG_PHONE_TAKEN');
  });
  it('enforces trial employee limit of 25', async () => {
    for (let i = 0; i < 23; i++) await addEmployee(co, M, 'employee');
    const t = await invite(admin.userId, pos);
    expect(await errorOf(accept(await createAuthUser({ phone: '+966551110007' }), t))).toBe('ORG_PLAN_LIMIT');
  });
  it('unit manager cannot invite', async () => {
    expect(await errorOf(invite(um.userId, pos))).toBe('ORG_FORBIDDEN');
  });
  it('invalid token is rejected', async () => {
    expect(await errorOf(asUser(null, (c) => c.query('select * from preview_invitation($1)', ['nope'])))).toBe('ORG_INVITE_INVALID');
  });
  it('a new invite revokes the previous unused one', async () => {
    const t1 = await invite(admin.userId, pos);
    await invite(admin.userId, pos);
    expect(await errorOf(accept(await createAuthUser({ phone: '+966551110008' }), t1))).toBe('ORG_INVITE_INVALID');
  });
  it('rejects Saudi nationality with an iqama', async () => {
    const t = await invite(admin.userId, pos);
    const u = await createAuthUser({ phone: '+966551110009' });
    const err = await errorOf(asUser(u, (c) => c.query(`select accept_invitation($1, 'موظف', '1995-05-05', 'male', 'SA', 'iqama', '2123456789', '2030-01-01', null, 'd@x.sa')`, [t])));
    expect(err).toBe('ORG_VALIDATION');
  });
});
