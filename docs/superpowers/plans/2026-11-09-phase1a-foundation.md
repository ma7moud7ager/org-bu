# Phase 1a — Foundation (Monorepo, Shared Domain Logic, Database) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation of org BU: a pnpm monorepo, a shared TypeScript domain package (permissions, org tree, validation, error codes), and the Supabase Postgres schema with RLS and RPCs for platform admin, company registration, org structure, roles, invitations, employees, announcements, notifications and audit — fully tested locally and deployed to the `org-bu` Supabase project.

**Architecture:** All business rules that must hold regardless of client live in Postgres (RLS policies + `security definer` RPCs running in a transaction). The same rules are mirrored in `packages/shared` as pure functions so the web and mobile apps (Phase 1b, 1c) can hide/disable UI without a round-trip. DB tests run with Vitest + `pg` against a throwaway local Postgres 16 that has a minimal stub of Supabase's `auth` schema.

**Tech Stack:** Node 22, pnpm workspaces, Turborepo, TypeScript (strict), Vitest, Zod, `pg`, PostgreSQL (local 16 for tests, Supabase 17 in cloud), pgcrypto, Supabase MCP for deployment.

**Spec:** `docs/superpowers/specs/2026-11-09-company-management-platform-design.md` (sections 4, 5.4, 6, 7, 8, 9, 10-Phase 1)

**Out of scope (later plans):** Phase 1b web app (owner panel + company admin UI), Phase 1c mobile app (invite registration, announcements, push). Phase 2+ modules.

## Global Constraints

- Every company-owned table has `company_id uuid not null` and RLS enabled; no company-owned table is readable across companies.
- Org unit types: `branch`, `department`, `section`, `team`. Activity types: `commercial`, `service`, `mixed`.
- Permission scopes: `company`, `branch`, `unit`, `self`.
- Fixed departments created for every company: الإدارة العامة (root), الموارد البشرية, المالية.
- Default roles (system_key): `company_admin`, `hr`, `finance`, `branch_manager`, `unit_manager`, `employee`.
- Identity types: `national_id`, `iqama`, `border_number`. Saudi nationality ⇒ `national_id`.
- ID/iqama/border numbers stored encrypted (pgcrypto); full value readable only by `company_admin` and `hr`.
- Invitation: single person, single use, default expiry 7 days, only SHA-256 hash stored.
- Commercial registration number (`cr_number`) unique across the platform; phone and email unique per user.
- Expired/cancelled subscription ⇒ company data read-only.
- Multi-step operations run inside a single RPC (one transaction).
- All user-facing errors are raised as stable codes (`ORG_xxx`) mapped to Arabic messages in `packages/shared`.
- Arabic is the primary language for seeded names and messages.

## Review Focus

1. A user of company A reading or writing a company B row by guessing its UUID → no rows / permission error (Task 6, 8 tests).
2. Two people accepting the same invitation at the same moment → exactly one succeeds, the other gets `ORG_INVITE_USED` (Task 10 test).
3. Deleting a unit whose employees sit in a nested sub-unit (not directly in it) → blocked with `ORG_UNIT_NOT_EMPTY` (Task 8 test).
4. The same Saudi mobile typed as `05xxxxxxxx`, `9665xxxxxxxx`, `+9665xxxxxxxx` → normalized to one value; second registration rejected as duplicate (Task 3 + Task 10 tests).
5. Moving a unit under its own descendant (creating a cycle) → rejected with `ORG_UNIT_CYCLE` (Task 8 test).

---

## File Structure

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .gitignore
packages/shared/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                 re-exports
  src/errors.ts                error codes + Arabic messages
  src/permissions.ts           permission catalog, default role grants, hasPermission()
  src/org-tree.ts              unit paths, direct manager, delete rules, templates
  src/validation.ts            zod schemas: phone, identity, company, employee profile
  src/invite.ts                token generation/hash/expiry
  test/*.test.ts
supabase/
  config.toml                  (supabase init)
  migrations/0001_platform.sql
  migrations/0002_tenancy.sql
  migrations/0003_rls_helpers.sql
  migrations/0004_register_company.sql
  migrations/0005_org_units_rules.sql
  migrations/0006_sensitive_and_audit.sql
  migrations/0007_invitations.sql
  migrations/0008_announcements_notifications.sql
  tests/auth_stub.sql          local-only stub of Supabase auth schema + roles
  tests/helpers.ts             db connection, reset, asUser()
  tests/*.test.ts
scripts/db-test.sh             boots local PG16, applies stub + migrations, runs vitest
```

---

### Task 1: Monorepo scaffold + error codes

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/errors.ts}`
- Test: `packages/shared/test/errors.test.ts`

**Interfaces:**
- Produces: `type ErrorCode` (union below), `ERROR_MESSAGES_AR: Record<ErrorCode,string>`, `messageFor(code: string): string` (unknown code → `"حدث خطأ غير متوقع"`). Package name `@orgbu/shared`.

Error codes (exact): `ORG_FORBIDDEN`, `ORG_CR_TAKEN`, `ORG_PHONE_TAKEN`, `ORG_EMAIL_TAKEN`, `ORG_UNIT_NOT_EMPTY`, `ORG_UNIT_FIXED`, `ORG_UNIT_CYCLE`, `ORG_INVITE_INVALID`, `ORG_INVITE_EXPIRED`, `ORG_INVITE_USED`, `ORG_POSITION_FILLED`, `ORG_PLAN_LIMIT`, `ORG_SUBSCRIPTION_INACTIVE`, `ORG_VALIDATION`.

- [ ] **Step 1:** Root `package.json` (`private: true`, scripts `test`, `test:db`, `typecheck` via turbo), `pnpm-workspace.yaml` with `packages/*` and `apps/*`, `tsconfig.base.json` strict + `moduleResolution: bundler`, `.gitignore` (node_modules, .turbo, dist, .env*, .pgdata).
- [ ] **Step 2: Write failing test** `errors.test.ts`: every code in the union has a non-empty Arabic message; `messageFor('ORG_UNIT_NOT_EMPTY')` contains `"موظفين"`; `messageFor('NOPE')` === `"حدث خطأ غير متوقع"`.
- [ ] **Step 3:** Run `pnpm --filter @orgbu/shared test` → FAIL (module missing).
- [ ] **Step 4:** Implement `src/errors.ts` (`ERROR_CODES` const array → type; messages in Arabic, e.g. ORG_UNIT_NOT_EMPTY = "لا يمكن حذف الوحدة لأن بها موظفين أو وحدات فرعية. انقلهم أولًا.").
- [ ] **Step 5:** Run test → PASS. `pnpm typecheck` → no errors.
- [ ] **Step 6:** Commit `chore: scaffold monorepo and shared error codes`.

---

### Task 2: Permission catalog and scope check

**Files:**
- Create: `packages/shared/src/permissions.ts`
- Test: `packages/shared/test/permissions.test.ts`

**Interfaces:**
- Produces:
  - `type Scope = 'company'|'branch'|'unit'|'self'`
  - `const PERMISSIONS` — exact keys: `structure.manage`, `roles.manage`, `employees.invite`, `employees.view`, `employees.edit`, `employees.terminate`, `employees.view_sensitive`, `announcements.publish`, `subscription.view`. `type Permission`.
  - `type Grant = { permission: Permission; scope: Scope }`
  - `DEFAULT_ROLE_GRANTS: Record<RoleKey, Grant[]>` where `RoleKey = 'company_admin'|'hr'|'finance'|'branch_manager'|'unit_manager'|'employee'`
  - `type ActorContext = { employeeId: string; unitPath: string[]; branchId: string|null }` (unitPath = ids root→own unit)
  - `type Target = { employeeId?: string; unitPath: string[]; branchId: string|null }`
  - `hasPermission(grants: Grant[], permission: Permission, actor: ActorContext, target: Target): boolean`

Default grants (exact):
- `company_admin`: every permission @ `company`.
- `hr`: `employees.invite|view|edit|terminate|view_sensitive`, `announcements.publish` @ `company`; `structure.manage` @ `company`.
- `finance`: `employees.view` @ `company`.
- `branch_manager`: `employees.invite|view|edit`, `announcements.publish` @ `branch`.
- `unit_manager`: `employees.view`, `announcements.publish` @ `unit`.
- `employee`: `employees.view` @ `self`.

Scope semantics: `company` → always true; `branch` → `actor.branchId !== null && actor.branchId === target.branchId`; `unit` → target.unitPath starts with actor.unitPath (actor's unit or below); `self` → `target.employeeId === actor.employeeId`. Multiple grants for one permission → any match.

- [ ] **Step 1: Failing tests:** (a) company_admin can `employees.edit` anywhere; (b) branch_manager of branch B1 can edit target in B1, cannot in B2, cannot when actor.branchId null; (c) unit_manager at path `[root,d1]` can view `[root,d1,s1]`, cannot view `[root,d2]`, cannot view parent `[root]`; (d) employee can view self only; (e) finance has no `employees.edit`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(shared): permission catalog and scope checks`.

---

### Task 3: Validation schemas (phone, identity, company, employee)

**Files:**
- Create: `packages/shared/src/validation.ts`
- Test: `packages/shared/test/validation.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSaudiPhone(input: string): string | null` → returns `+9665XXXXXXXX` (12 digits after `+`) or null.
  - `identitySchema` (zod discriminated union on `nationality_is_saudi` / `identity_type`):
    - Saudi ⇒ `identity_type = 'national_id'`, number `/^1\d{9}$/`.
    - Non-Saudi + `iqama` ⇒ number `/^2\d{9}$/`, `iqama_expiry` required (ISO date).
    - Non-Saudi + `border_number` ⇒ number `/^\d{10}$/` (`BORDER_NUMBER_PATTERN`, exported constant, confirm with real samples before launch), `entry_date` required.
  - `companyRegistrationSchema`: `legal_name` (2–200 chars), `cr_number` `/^\d{10}$/`, `employee_count` int 1–100000, `activity_type` enum.
  - `employeeProfileSchema`: `full_name` (3–120), `birth_date` (age 15–80 at today), `gender` `'male'|'female'`, `phone` (normalized via `normalizeSaudiPhone`, transform), `email` (lowercased), `nationality` (ISO-3166 alpha-2, `'SA'` ⇒ Saudi), plus identity fields merged.
  - Types: `CompanyRegistration`, `EmployeeProfile` (inferred).

- [ ] **Step 1: Failing tests:** `normalizeSaudiPhone` maps `0551234567`, `551234567`, `966551234567`, `+966551234567`, `+966 55 123 4567` → `+966551234567`; rejects `0451234567`, `12345`. Identity: SA with `2…` rejected; non-SA iqama without expiry rejected; border number with entry_date accepted. Company: `cr_number` `'123'` rejected. Employee: birth_date 10 years ago rejected; email `A@B.COM` → `a@b.com`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with zod.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(shared): validation schemas for phone, identity, company, employee`.

---

### Task 4: Org tree logic and invite tokens

**Files:**
- Create: `packages/shared/src/org-tree.ts`, `packages/shared/src/invite.ts`
- Test: `packages/shared/test/org-tree.test.ts`, `packages/shared/test/invite.test.ts`

**Interfaces:**
- Produces (org-tree):
  - `type UnitType = 'branch'|'department'|'section'|'team'`, `type ActivityType = 'commercial'|'service'|'mixed'`
  - `type OrgUnit = { id: string; parentId: string|null; type: UnitType; name: string; isFixed: boolean; managerPositionId: string|null }`
  - `type PositionRef = { id: string; unitId: string; isManager: boolean; employeeId: string|null }`
  - `unitPath(units: OrgUnit[], unitId: string): string[]` (root→unit; throws `ORG_UNIT_CYCLE` on loop)
  - `branchOf(units: OrgUnit[], unitId: string): string|null` (nearest ancestor-or-self with type `branch`)
  - `resolveDirectManager(units: OrgUnit[], positions: PositionRef[], employeePositionId: string): string|null` → employeeId of manager, per spec §4.1 (own unit's manager unless self/empty → walk up; root manager → null)
  - `wouldCreateCycle(units: OrgUnit[], unitId: string, newParentId: string): boolean`
  - `templateFor(activity: ActivityType): Array<{ key: string; parentKey: string|null; type: UnitType; name: string; isFixed: boolean }>` — commercial: root "الإدارة العامة" + fixed HR, Finance + one branch "الفرع الرئيسي"; service: root + HR + Finance; mixed: same as commercial.
- Produces (invite):
  - `INVITE_TTL_DAYS = 7`
  - `generateInviteToken(): string` (32 random bytes, base64url)
  - `hashInviteToken(token: string): string` (SHA-256 hex) — must equal Postgres `encode(digest(token,'sha256'),'hex')`
  - `inviteExpiry(from: Date, days = INVITE_TTL_DAYS): Date`

- [ ] **Step 1: Failing tests:** tree root→branch B→dept D→section S with managers at root, B, D (S none): employee in S ⇒ manager of D; manager of D ⇒ manager of B; manager of root ⇒ null; manager position vacant at D ⇒ walk to B. `branchOf(S)` = B; `branchOf(root)` = null. `wouldCreateCycle(B → S)` true. `templateFor('service')` has no `branch`; every template has exactly 3 fixed units. Token is 43 chars base64url; hash of `"abc"` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (Node `crypto`).
- [ ] **Step 4:** Run → PASS. Export everything from `src/index.ts`.
- [ ] **Step 5:** Commit `feat(shared): org tree rules and invite tokens`.

---

### Task 5: Local DB test harness + platform tables

**Files:**
- Create: `supabase/config.toml` (`npx supabase init`), `supabase/tests/auth_stub.sql`, `supabase/tests/helpers.ts`, `supabase/tests/vitest.config.ts`, `supabase/package.json` (name `@orgbu/db`), `scripts/db-test.sh`
- Create: `supabase/migrations/0001_platform.sql`
- Test: `supabase/tests/platform.test.ts`

**Interfaces:**
- `auth_stub.sql` (local only, never deployed): roles `anon`, `authenticated`, `service_role`; schema `auth` with `auth.users(id uuid pk, phone text, email text)`; `auth.uid()` returns `nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid`; `create extension pgcrypto`.
- `helpers.ts` produces: `db(): pg.Pool` (from `DATABASE_URL`), `resetDb(): Promise<void>` (truncate all public tables + auth.users, restart identity), `createAuthUser(opts?: {phone?: string; email?: string}): Promise<string>`, `asUser<T>(userId: string|null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T>` (BEGIN; `set local role authenticated` (or `anon` if null); `set local request.jwt.claims` to `{"sub":userId}`; run; ROLLBACK unless fn commits via returned value — use COMMIT so effects persist), `asService<T>(fn)`.
- `scripts/db-test.sh`: init cluster in `.pgdata` with `/usr/lib/postgresql/16/bin/initdb` if missing, start on port 54329, drop/create db `orgbu_test`, apply `auth_stub.sql` then `migrations/*.sql` in order with `psql -v ON_ERROR_STOP=1`, run `pnpm --filter @orgbu/db test`, stop server on exit (trap).
- `0001_platform.sql` produces: tables `platform_admins(user_id pk → auth.users)`, `plans(id, name, price_monthly numeric(10,2), price_yearly numeric(10,2), max_employees int, modules text[], is_active bool default true, created_at)`, `department_catalog(id, name_ar, name_en, is_fixed bool)`; function `public.is_platform_admin() returns boolean` (security definer, stable); RLS: `plans` select for authenticated where `is_active or is_platform_admin()`, all writes `is_platform_admin()`; `department_catalog` select authenticated, writes platform admin; seed catalog: fixed الإدارة العامة/General Management, الموارد البشرية/Human Resources, المالية/Finance; variable التسويق, المبيعات, المشتريات, المخازن واللوجستيات, خدمة العملاء, العمليات, تقنية المعلومات, الجودة, الشؤون القانونية.

- [ ] **Step 1: Failing tests** `platform.test.ts`: normal user can select active plans but `insert into plans` fails (RLS); platform admin can insert plan; catalog has exactly 3 rows with `is_fixed = true`; anon cannot select plans.
- [ ] **Step 2:** `bash scripts/db-test.sh` → FAIL (tables missing).
- [ ] **Step 3:** Write `0001_platform.sql`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): local test harness and platform tables`.

---

### Task 6: Tenancy schema + RLS helpers

**Files:**
- Create: `supabase/migrations/0002_tenancy.sql`, `supabase/migrations/0003_rls_helpers.sql`
- Test: `supabase/tests/tenancy.test.ts`

**Interfaces:**
- `0002` tables (all with `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`):
  - `companies(legal_name, cr_number unique, employee_count, activity_type check in (...), status check in ('active','suspended') default 'active')`
  - `subscriptions(company_id, plan_id null, status check in ('trial','active','expired','cancelled'), starts_at, ends_at)` — one current row per company (unique on company_id).
  - `org_units(company_id, parent_id null → org_units, type, name, catalog_id null, is_fixed bool, manager_position_id null)`; unique `(company_id) where parent_id is null` (one root).
  - `roles(company_id, name, system_key null)`, unique `(company_id, system_key)`.
  - `role_permissions(role_id → roles on delete cascade, permission text, scope text check in scopes)`, pk `(role_id, permission, scope)`.
  - `positions(company_id, org_unit_id → org_units, title, role_id → roles, is_manager bool)`; FK `org_units.manager_position_id → positions` (deferrable).
  - `employees(company_id, user_id → auth.users unique, position_id → positions unique, full_name, birth_date, gender, nationality char(2), identity_type, identity_number_enc bytea, identity_last4 text, iqama_expiry date null, entry_date date null, phone text unique, email text unique, contract_start date null, contract_end date null, status check in ('active','terminated') default 'active')`.
  - Indexes on every `company_id` and `parent_id`.
- `0003` functions (security definer, stable, `set search_path = public`):
  - `current_employee() returns employees` (row for `auth.uid()` with status active)
  - `current_company_id() returns uuid`
  - `unit_path(p_unit uuid) returns uuid[]` (recursive CTE root→unit)
  - `unit_branch(p_unit uuid) returns uuid`
  - `company_is_writable(p_company uuid) returns boolean` (subscription status in trial/active and (`ends_at` null or > now()))
  - `has_permission(p_permission text, p_target_unit uuid, p_target_employee uuid default null) returns boolean` — same semantics as `hasPermission` in Task 2 using grants of current employee's position role.
  - RLS: enable on all 0002 tables. Select policy: `company_id = current_company_id()` (companies: `id = current_company_id()`; role_permissions via join on roles) or `is_platform_admin()`. Insert/update/delete on `org_units`, `positions`, `roles`, `role_permissions`: `company_is_writable(company_id) and has_permission('structure.manage', <unit>)` (roles/role_permissions require `roles.manage`). Employees: select requires `has_permission('employees.view', unit_of(position), id)`; update requires `employees.edit` + writable. No direct insert on companies/subscriptions/employees (RPC only).

- [ ] **Step 1: Failing tests** (seed two companies directly via `asService`, each with root unit, admin role with all grants, admin position, admin employee): user A selects companies → only A; user A selects `org_units where id = <B root>` → 0 rows; user A update B unit → 0 rows affected; plain employee in A (role `employee`) sees only own employee row; after setting A subscription `expired`, A admin's `insert into org_units` fails while select still works; platform admin sees both companies.
- [ ] **Step 2:** Run `bash scripts/db-test.sh` → FAIL.
- [ ] **Step 3:** Write `0002`, `0003`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): tenancy schema with company isolation and permission helpers`.

---

### Task 7: `register_company` RPC

**Files:**
- Create: `supabase/migrations/0004_register_company.sql`
- Test: `supabase/tests/register-company.test.ts`

**Interfaces:**
- Consumes: Task 6 tables/functions; template rules from Task 4 (`templateFor`) re-expressed in SQL.
- Produces: `register_company(p_legal_name text, p_cr_number text, p_employee_count int, p_activity_type text, p_selected_catalog_ids uuid[], p_admin_full_name text, p_admin_phone text, p_admin_email text) returns uuid` (company id). Security definer, callable by `authenticated`. In one transaction:
  1. Reject if caller already has an employee row (`ORG_VALIDATION`), cr taken (`ORG_CR_TAKEN`), phone/email taken (`ORG_PHONE_TAKEN`/`ORG_EMAIL_TAKEN`).
  2. Insert company; subscription `trial`, `ends_at = now() + interval '14 days'`.
  3. Create 6 default roles with grants identical to `DEFAULT_ROLE_GRANTS`.
  4. Create units per template (root, HR, Finance fixed with matching `catalog_id`; branch "الفرع الرئيسي" for commercial/mixed) + one `department` per selected non-fixed catalog id under root.
  5. Create position "مدير الحساب" in root, role `company_admin`, `is_manager = true`; set root `manager_position_id`; create employee for caller (identity fields null until profile completion).
- Errors raised as `raise exception using errcode = 'P0001', message = '<CODE>'`.

- [ ] **Step 1: Failing tests:** commercial registration ⇒ 4 template units + selected departments, exactly 3 `is_fixed`, 1 branch, 6 roles, caller is employee with role `company_admin`, `has_permission('structure.manage', root)` true for caller; service ⇒ no branch; same cr twice ⇒ error message `ORG_CR_TAKEN`; caller registering a second company ⇒ `ORG_VALIDATION`; subscription status `trial`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): register_company RPC with templates and default roles`.

---

### Task 8: Org unit rules (move, delete, fixed, cycle)

**Files:**
- Create: `supabase/migrations/0005_org_units_rules.sql`
- Test: `supabase/tests/org-units.test.ts`

**Interfaces:**
- Produces:
  - Trigger `org_units_guard` (before update of `parent_id`): rejects cycles (`ORG_UNIT_CYCLE`), rejects parent in another company, rejects making root non-root.
  - Revoke direct `delete` on `org_units` from `authenticated`; deletion only via `delete_org_unit(p_unit uuid, p_replacement uuid default null) returns void`:
    - requires `has_permission('structure.manage', p_unit)` and writable company.
    - root ⇒ `ORG_UNIT_FIXED` always.
    - if unit or any descendant has positions/employees or child units: if `p_replacement` null ⇒ `ORG_UNIT_NOT_EMPTY`; else move child units and positions of `p_unit` itself to `p_replacement` (replacement must be same company, not inside `p_unit`'s subtree), then delete.
    - fixed non-root unit with employees ⇒ requires `p_replacement` (same rule); fixed empty unit ⇒ `ORG_UNIT_FIXED`.
  - `create_org_unit(p_parent uuid, p_type text, p_name text, p_catalog_id uuid default null) returns uuid` (permission `structure.manage` on parent).

- [ ] **Step 1: Failing tests:** move branch under its own section ⇒ `ORG_UNIT_CYCLE`; delete dept whose employee is in a nested section ⇒ `ORG_UNIT_NOT_EMPTY`; same with replacement ⇒ succeeds and the employee's position now under replacement subtree; delete empty fixed HR ⇒ `ORG_UNIT_FIXED`; delete HR with employees + replacement ⇒ succeeds; delete root ⇒ `ORG_UNIT_FIXED`; branch_manager of branch B1 calling `create_org_unit` under B2 ⇒ `ORG_FORBIDDEN`; direct `delete from org_units` as authenticated ⇒ permission denied.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): org unit move/delete rules`.

---

### Task 9: Sensitive identity data + audit log

**Files:**
- Create: `supabase/migrations/0006_sensitive_and_audit.sql`
- Test: `supabase/tests/sensitive.test.ts`

**Interfaces:**
- Produces:
  - Encryption key read via `private.identity_key()` (security definer; reads `current_setting('app.identity_key')` locally; in Supabase reads from Vault secret `identity_key`). Schema `private` not exposed to API.
  - `set_employee_identity(p_employee uuid, p_identity_type text, p_number text, p_iqama_expiry date, p_entry_date date)` — allowed for the employee themself (self) or `employees.edit`; validates patterns identical to Task 3; stores `pgp_sym_encrypt` in `identity_number_enc`, last 4 digits in `identity_last4`.
  - `get_employee_identity_number(p_employee uuid) returns text` — requires `employees.view_sensitive`; writes audit row.
  - `audit_log(id, company_id, actor_user_id, action, entity, entity_id, before jsonb, after jsonb, at)`; RLS select for `company_admin` role holders only (via `has_permission('roles.manage', root)`); insert only via triggers/functions.
  - Audit triggers on `employees` (update of status/position_id), `role_permissions` (insert/delete), `org_units` (delete).

- [ ] **Step 1: Failing tests:** employee sets own iqama number `2123456789` ⇒ `identity_last4 = '6789'`, raw column is not plaintext; iqama number `1123456789` ⇒ `ORG_VALIDATION`; HR reads full number ⇒ `2123456789` and an audit row with action `identity.read` exists; branch_manager reading ⇒ `ORG_FORBIDDEN`; deleting a role grant creates audit row.
- [ ] **Step 2:** Run → FAIL (`scripts/db-test.sh` sets `app.identity_key` via `ALTER DATABASE orgbu_test SET app.identity_key = 'test-key'`).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): encrypted identity numbers and audit log`.

---

### Task 10: Invitations

**Files:**
- Create: `supabase/migrations/0007_invitations.sql`
- Test: `supabase/tests/invitations.test.ts`

**Interfaces:**
- Consumes: `hashInviteToken` semantics (Task 4), `set_employee_identity` (Task 9).
- Produces:
  - `invitations(id, company_id, position_id, token_hash text unique, sent_to text, expires_at, used_at null, created_by uuid)`; RLS select for `employees.invite` holders within scope; no direct writes.
  - `create_invitation(p_position uuid, p_sent_to text, p_ttl_days int default 7) returns text` — raw token returned once (generated with `gen_random_bytes(32)` → base64url); requires `employees.invite` on the position's unit + writable; position must have no active employee (`ORG_POSITION_FILLED`); revokes previous unused invites for that position.
  - `preview_invitation(p_token text) returns table(company_name text, unit_name text, position_title text)` — callable by `anon`; `ORG_INVITE_INVALID|EXPIRED|USED`.
  - `accept_invitation(p_token text, p_full_name text, p_birth_date date, p_gender text, p_nationality text, p_identity_type text, p_identity_number text, p_iqama_expiry date, p_entry_date date, p_email text) returns uuid` — callable by `authenticated` (phone comes from `auth.users.phone` of caller, already OTP-verified); `select … for update` on the invitation row; checks expiry/used, position still empty, plan `max_employees` not exceeded (`ORG_PLAN_LIMIT`; trial = no plan ⇒ limit 25), phone/email uniqueness; creates employee, calls identity setter, marks `used_at`. Returns employee id.

- [ ] **Step 1: Failing tests:** admin creates invite ⇒ token returned, DB holds only hash equal to `encode(digest(token,'sha256'),'hex')`; anon preview returns position title; accept ⇒ employee linked to position, `used_at` set; second accept ⇒ `ORG_INVITE_USED`; two concurrent accepts (two pool clients, `Promise.allSettled`) ⇒ exactly one fulfilled; expired invite ⇒ `ORG_INVITE_EXPIRED`; invite for filled position ⇒ `ORG_POSITION_FILLED`; phone `+966551234567` already used by another employee ⇒ `ORG_PHONE_TAKEN`; 26th employee on trial ⇒ `ORG_PLAN_LIMIT`; unit_manager (no `employees.invite`) ⇒ `ORG_FORBIDDEN`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): single-use invitations and employee onboarding`.

---

### Task 11: Announcements and notifications

**Files:**
- Create: `supabase/migrations/0008_announcements_notifications.sql`
- Test: `supabase/tests/announcements.test.ts`

**Interfaces:**
- Produces:
  - `announcements(id, company_id, kind check in ('news','decision'), title, body, audience_unit_ids uuid[] null /* null = whole company */, pinned bool, published_by uuid, published_at)`, `announcement_reads(announcement_id, employee_id, read_at, pk(both))`, `notifications(id, user_id, company_id null, type text, payload jsonb, read_at null, created_at)`.
  - `publish_announcement(p_kind text, p_title text, p_body text, p_audience uuid[], p_pinned bool default false) returns uuid` — requires `announcements.publish` for every audience unit (null audience ⇒ requires scope `company`); inserts one `notifications` row (`type = 'announcement'`, payload `{announcement_id, kind, title}`) per active employee whose unit path intersects the audience.
  - RLS: employee selects announcements where audience null or `unit_path(own unit) && audience_unit_ids`; notifications select/update(`read_at` only) where `user_id = auth.uid()`; `mark_announcement_read(p_announcement uuid)`.
  - Enable Supabase Realtime on `notifications` (`alter publication supabase_realtime add table notifications` — guarded `if exists` so local tests pass).

- [ ] **Step 1: Failing tests:** HR publishes to whole company ⇒ every active employee gets a notification; unit_manager of D publishes to D ⇒ employees in D and its sections notified, employees outside not, and they cannot select the announcement; unit_manager publishing to whole company ⇒ `ORG_FORBIDDEN`; user cannot read another user's notifications; mark read inserts read row once (idempotent).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): announcements with audience targeting and notifications`.

---

### Task 12: Deploy to Supabase `org-bu` and generate types

**Files:**
- Create: `packages/shared/src/db.types.ts` (generated)
- Modify: `packages/shared/src/index.ts` (export `Database` type)

**Interfaces:**
- Consumes: all migrations 0001–0008. Supabase project ref `ziwyfxslsmzqddirbnod` (org `izuibhhvqsnrnkglwhyk`).
- Produces: deployed schema; `Database` type for Phase 1b/1c.

- [ ] **Step 1:** Create Vault secret `identity_key` (random 32-byte hex) in the project via `execute_sql` (`select vault.create_secret(...)`); never commit it.
- [ ] **Step 2:** Apply each migration in order with Supabase MCP `apply_migration` (name = file stem).
- [ ] **Step 3:** Run MCP `get_advisors` (security + performance) → expected: no `ERROR`-level findings; fix any RLS-disabled or mutable search_path warnings in a new migration `0009_advisor_fixes.sql` (also apply locally and re-run `scripts/db-test.sh` → PASS).
- [ ] **Step 4:** Smoke test via `execute_sql`: `select count(*) from department_catalog where is_fixed` → `3`.
- [ ] **Step 5:** MCP `generate_typescript_types` → write to `packages/shared/src/db.types.ts`; `pnpm typecheck` → PASS.
- [ ] **Step 6:** Commit `chore(db): deploy phase 1a schema and generate types`.

---

## Spec coverage map

| Spec section | Task |
|---|---|
| 2.1 owner panel data (plans, catalog) | 5 |
| 4.1 tree, templates, direct manager, fixed/variable rules | 4, 7, 8 |
| 4.2 employee fields | 3, 6, 9 |
| 4.3 registration + invitations | 7, 10 |
| 4.4 permissions & scopes | 2, 6 |
| 4.5 requests engine (tables only in Phase 1) | deferred to Phase 2 plan (YAGNI: no consumer in Phase 1) |
| 4.6 notifications | 11 |
| 5.4 announcements | 11 |
| 6 data model | 5–11 |
| 7 security/PDPL (isolation, encryption, audit, hashed invites) | 6, 9, 10 |
| 8 errors, transactions, expired subscription read-only | 1, 6, 7, 8, 10 |
| 9 testing | all |
