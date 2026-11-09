import { DEFAULT_ROLE_GRANTS, type RoleKey } from '@orgbu/shared';
import { asService, createAuthUser } from './helpers';

export type SeededCompany = { companyId: string; rootId: string; roles: Record<RoleKey, string> };

let crCounter = 1000000000;

export async function seedCompany(opts: { activity?: string; subscription?: string } = {}): Promise<SeededCompany> {
  return asService(async (c) => {
    const cr = String(crCounter++);
    const company = await c.query<{ id: string }>(
      `insert into companies (legal_name, cr_number, employee_count, activity_type) values ($1, $2, 10, $3) returning id`,
      [`شركة ${cr}`, cr, opts.activity ?? 'commercial'],
    );
    const companyId = company.rows[0]!.id;
    await c.query(`insert into subscriptions (company_id, status, starts_at) values ($1, $2, now())`, [
      companyId,
      opts.subscription ?? 'trial',
    ]);
    const root = await c.query<{ id: string }>(
      `insert into org_units (company_id, type, name, is_fixed) values ($1, 'department', 'الإدارة العامة', true) returning id`,
      [companyId],
    );
    const roles = {} as Record<RoleKey, string>;
    for (const [key, grants] of Object.entries(DEFAULT_ROLE_GRANTS) as [RoleKey, typeof DEFAULT_ROLE_GRANTS[RoleKey]][]) {
      const r = await c.query<{ id: string }>(
        `insert into roles (company_id, name, system_key) values ($1, $2, $2) returning id`,
        [companyId, key],
      );
      roles[key] = r.rows[0]!.id;
      for (const g of grants) {
        await c.query(`insert into role_permissions (role_id, permission, scope) values ($1, $2, $3)`, [
          r.rows[0]!.id,
          g.permission,
          g.scope,
        ]);
      }
    }
    return { companyId, rootId: root.rows[0]!.id, roles };
  });
}

export async function addUnit(companyId: string, parentId: string, type: string, name = type, isFixed = false): Promise<string> {
  return asService(async (c) => {
    const r = await c.query<{ id: string }>(
      `insert into org_units (company_id, parent_id, type, name, is_fixed) values ($1, $2, $3, $4, $5) returning id`,
      [companyId, parentId, type, name, isFixed],
    );
    return r.rows[0]!.id;
  });
}

let phoneCounter = 500000000;

export type SeededEmployee = { userId: string; employeeId: string; positionId: string; phone: string };

export async function addEmployee(
  co: SeededCompany,
  unitId: string,
  role: RoleKey,
  opts: { isManager?: boolean } = {},
): Promise<SeededEmployee> {
  const phone = `+966${phoneCounter++}`;
  const userId = await createAuthUser({ phone });
  return asService(async (c) => {
    const pos = await c.query<{ id: string }>(
      `insert into positions (company_id, org_unit_id, title, role_id, is_manager) values ($1, $2, $3, $4, $5) returning id`,
      [co.companyId, unitId, role, co.roles[role], !!opts.isManager],
    );
    const positionId = pos.rows[0]!.id;
    if (opts.isManager) await c.query(`update org_units set manager_position_id = $1 where id = $2`, [positionId, unitId]);
    const emp = await c.query<{ id: string }>(
      `insert into employees (company_id, user_id, position_id, full_name, phone, email)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [co.companyId, userId, positionId, `موظف ${phone}`, phone, `${phone.slice(1)}@test.sa`],
    );
    return { userId, employeeId: emp.rows[0]!.id, positionId, phone };
  });
}
