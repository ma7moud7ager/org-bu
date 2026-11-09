import pg from 'pg';

let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}

export async function resetDb(): Promise<void> {
  const { rows } = await db().query<{ t: string }>(
    `select quote_ident(schemaname)||'.'||quote_ident(tablename) as t from pg_tables
     where schemaname = 'public' and tablename not in ('department_catalog')`,
  );
  const tables = [...rows.map((r) => r.t), 'auth.users'];
  await db().query(`truncate ${tables.join(', ')} restart identity cascade`);
}

export async function createAuthUser(opts: { phone?: string; email?: string } = {}): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    'insert into auth.users (phone, email) values ($1, $2) returning id',
    [opts.phone ?? null, opts.email ?? null],
  );
  return rows[0]!.id;
}

async function inRole<T>(role: string, claims: object | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [claims ? JSON.stringify(claims) : '']);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export function asUser<T>(userId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return inRole(userId ? 'authenticated' : 'anon', userId ? { sub: userId, role: 'authenticated' } : null, fn);
}

export function asService<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  return inRole('service_role', { role: 'service_role' }, fn);
}

/** Runs fn and returns the raised error message (e.g. 'ORG_FORBIDDEN'), or null if it succeeded. */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
