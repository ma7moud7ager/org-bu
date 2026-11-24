import { describe, it, expect, beforeEach } from 'vitest';
import { asOwner, asService, db, resetDb } from './helpers';
import { seedCompany, addEmployee } from './fixtures';

describe('phase 2a schema', () => {
  beforeEach(resetDb);

  it('adds termination columns and the position phone flag (default off)', async () => {
    const co = await seedCompany();
    const e = await addEmployee(co, co.rootId, 'hr');
    const r = await db().query(
      `select e.termination_reason, e.termination_note, e.last_working_day, e.terminated_at, e.terminated_by,
              p.show_phone_to_reports
       from employees e join positions p on p.id = e.position_id where e.id = $1`,
      [e.employeeId],
    );
    expect(r.rows[0]).toEqual({
      termination_reason: null, termination_note: null, last_working_day: null,
      terminated_at: null, terminated_by: null, show_phone_to_reports: false,
    });
  });

  it('creates requests, request_events and scheduled_actions with RLS on', async () => {
    const r = await db().query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('requests','request_events','scheduled_actions') and relnamespace = 'public'::regnamespace
       order by relname`,
    );
    expect(r.rows).toEqual([
      { relname: 'request_events', relrowsecurity: true },
      { relname: 'requests', relrowsecurity: true },
      { relname: 'scheduled_actions', relrowsecurity: true },
    ]);
  });

  it('rejects an unknown termination reason', async () => {
    const co = await seedCompany();
    const e = await addEmployee(co, co.rootId, 'hr');
    await expect(db().query(`update employees set termination_reason = 'fired' where id = $1`, [e.employeeId])).rejects.toThrow();
  });

  it('backfill gives existing roles the new grants', async () => {
    const co = await seedCompany();
    await asService((c) => c.query(
      `delete from role_permissions where role_id = any($1) and permission in
       ('employees.transfer','requests.decide','employees.request_terminate','employees.request_transfer')`,
      [[co.roles.hr, co.roles.branch_manager, co.roles.company_admin]],
    ));
    await asOwner((c) => c.query('select private.backfill_role_grants()'));
    const r = await db().query<{ role_id: string; permission: string; scope: string }>(
      `select role_id, permission, scope from role_permissions where role_id = any($1) and permission in
       ('employees.transfer','requests.decide','employees.request_terminate','employees.request_transfer')`,
      [[co.roles.hr, co.roles.branch_manager]],
    );
    const got = r.rows.map((x) => `${x.role_id === co.roles.hr ? 'hr' : 'bm'}:${x.permission}:${x.scope}`).sort();
    expect(got).toEqual([
      'bm:employees.request_terminate:branch', 'bm:employees.request_transfer:branch',
      'hr:employees.transfer:company', 'hr:requests.decide:company',
    ]);
    // idempotent
    await asOwner((c) => c.query('select private.backfill_role_grants()'));
  });

  it('today_riyadh() is the Riyadh calendar date', async () => {
    const r = await db().query(`select today_riyadh() = (now() at time zone 'Asia/Riyadh')::date as ok`);
    expect(r.rows[0]!.ok).toBe(true);
  });
});
