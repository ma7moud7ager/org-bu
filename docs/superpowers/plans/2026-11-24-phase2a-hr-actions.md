# Phase 2a — Requests Engine, Termination, Transfer, Profile Edits, My Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the HR gaps: a generic requests engine, termination (direct + by request), transfer (immediate/scheduled, vacant or new position), HR/self profile edits, and a "بياناتي" page with the direct manager.

**Architecture:** All rules in Postgres RPCs (`security definer`, one transaction, `ORG_*` errors) with DB tests on local PG16; the web app (Next.js on Cloudflare) calls RPCs and mirrors permission checks from `@orgbu/shared` for UI gating only. Scheduled actions run daily via `pg_cron`.

**Tech Stack:** as Phase 1b. **Spec:** `docs/superpowers/specs/2026-11-24-phase2a-hr-actions-design.md`.

## Global Constraints
- New permissions (exact keys): `employees.transfer`, `employees.request_terminate`, `employees.request_transfer`, `requests.decide`.
  - `company_admin` and `hr`: `employees.transfer`, `requests.decide` @ company (company_admin keeps every permission @ company).
  - `branch_manager`: `employees.request_terminate`, `employees.request_transfer` @ branch.
  - Existing companies are backfilled with the same grants.
- Termination reasons (exact): `resignation`, `dismissal`, `contract_end`, `probation`, `other`.
- Request types: `termination`, `transfer`. Statuses: `pending`, `approved`, `rejected`, `postponed`, `cancelled`.
- Scheduled actions execute when `run_at <= current_date` (Asia/Riyadh); daily cron at 00:05 Riyadh (21:05 UTC).
- A terminated employee cannot use the workspace; they see an "انتهت خدمتك" page, never the company-registration page.
- `positions.show_phone_to_reports` default `false`.

## Review Focus
1. Branch manager submits a request for an employee outside their branch → `ORG_FORBIDDEN` (Task 4 test).
2. Transfer scheduled for a date, then the target vacant position is filled by an invite before that date → run fails safely: action marked `failed`, employee unchanged, HR notified (Task 3 test).
3. Terminated user logs in again → routed to `/ended`, not `/onboarding` (Task 7 test).
4. HR approves a request whose employee was already terminated meanwhile → `ORG_VALIDATION`, request stays pending (Task 4 test).
5. Employee updates own iqama with an invalid number → `ORG_VALIDATION`; valid update notifies HR (Task 5 test).

---

### Task 1: Schema, permissions, backfill
**Files:** `supabase/migrations/0014_hr_actions_schema.sql`; `packages/shared/src/permissions.ts`; tests `supabase/tests/hr-schema.test.ts`, existing grants-consistency test.
- `employees` + `termination_reason text check(in reasons)`, `termination_note text`, `last_working_day date`, `terminated_at timestamptz`, `terminated_by uuid`.
- `positions` + `show_phone_to_reports boolean not null default false`.
- `requests(id, company_id, type, requester_employee_id, subject_employee_id, payload jsonb, status, decided_by, decided_at, decision_note, postponed_until date, created_at)`; `request_events(id, request_id, actor_employee_id, action, note, payload jsonb, at)`.
- `scheduled_actions(id, company_id, kind check in ('termination','transfer'), employee_id, payload jsonb, run_at date, status check in ('scheduled','done','cancelled','failed'), created_by, created_at, executed_at, error text)`.
- Update `default_role_grants()` + `DEFAULT_ROLE_GRANTS` + `PERMISSIONS`; insert missing grants for existing roles by `system_key`.
- RLS: requests visible to requester, subject (no), and holders of `requests.decide`; scheduled_actions visible to `employees.transfer`/`employees.terminate` holders; no direct writes.
- [ ] Failing tests: new columns exist with defaults; grants test (equality with shared) passes after shared update; an existing company's hr role gains `requests.decide`. → implement → pass → commit.

### Task 2: Termination
**Files:** `supabase/migrations/0015_termination.sql`; test `supabase/tests/termination.test.ts`.
- `terminate_employee(p_employee uuid, p_reason text, p_note text, p_last_day date) returns void` — requires `employees.terminate` on target; `p_last_day >= current_date`; cannot terminate self or the last `company_admin`; if `p_last_day = current_date` → `apply_termination` now, else insert `scheduled_actions(kind 'termination')` and store reason/note/last day on the employee.
- `apply_termination(p_employee uuid)` (internal): status `terminated`, `terminated_at`, `position_id = null` (position becomes vacant; manager flag unchanged), audit `employee.terminate`.
- `cancel_termination(p_employee uuid)` — only while a scheduled termination exists; clears fields, cancels action.
- [ ] Failing tests: HR terminates today → status terminated, position vacant, audit row; future date → still active + scheduled action; cancel works; branch manager direct call → `ORG_FORBIDDEN`; terminating last admin → `ORG_VALIDATION`; terminated user's `current_employee()` is null. → implement → pass → commit.

### Task 3: Transfer + scheduled runner
**Files:** `supabase/migrations/0016_transfer.sql`; test `supabase/tests/transfer.test.ts`.
- `transfer_employee(p_employee uuid, p_target_position uuid, p_new_unit uuid, p_new_title text, p_new_role uuid, p_run_at date) returns uuid` — exactly one of `p_target_position` or (`p_new_unit`,`p_new_title`,`p_new_role`); requires `employees.transfer` on both current and destination units; target position must be vacant and same company; new position uses `can_assign_role`; `p_run_at` null or today → apply now, else schedule. Returns destination position id.
- `apply_transfer(...)` (internal): re-validates vacancy; moves `position_id`; audit `employee.transfer`.
- `cancel_scheduled_action(p_action uuid)`.
- `run_scheduled_actions() returns int` — executes due actions; on failure marks `failed` with error and notifies HR holders (`type 'scheduled_failed'`).
- [ ] Failing tests: immediate transfer to vacant position; new-position transfer; scheduled transfer runs only when due; target filled before run → `failed` + employee unchanged + notification; destination outside HR scope impossible for branch-scoped callers. → implement → pass → commit.

### Task 4: Requests engine
**Files:** `supabase/migrations/0017_requests.sql`; test `supabase/tests/requests.test.ts`.
- `submit_request(p_type text, p_subject uuid, p_payload jsonb) returns uuid` — termination needs `employees.request_terminate` on subject; transfer needs `employees.request_transfer` on subject; payload validated per type (termination: reason, note, last_day; transfer: target_position | new_unit+new_title+new_role, run_at); notifies every holder of `requests.decide` (`type 'request_new'`).
- `decide_request(p_request uuid, p_decision text, p_note text, p_payload jsonb default null, p_postpone_until date default null)` — requires `requests.decide`; `approve` executes `terminate_employee`/`transfer_employee` with `coalesce(p_payload, payload)` in the same transaction; subject already terminated → `ORG_VALIDATION`; `reject` needs note; `postpone` needs date; notifies requester (`type 'request_decided'`); writes `request_events`.
- `cancel_request(p_request uuid)` — requester only, while pending/postponed.
- [ ] Failing tests: branch manager submits termination for own-branch employee → HR notified; for other-branch employee → `ORG_FORBIDDEN`; HR approves → employee terminated (today) / scheduled (future); approve with edited last day uses the edit; reject without note → `ORG_VALIDATION`; requester sees own requests, other employee sees none; Review Focus #4. → implement → pass → commit.

### Task 5: Profile edits
**Files:** `supabase/migrations/0018_profile_edits.sql`; test `supabase/tests/profile-edits.test.ts`.
- `update_employee_profile(p_employee uuid, p_full_name, p_birth_date, p_gender, p_nationality, p_email, p_contract_start, p_contract_end)` — `employees.edit`; validates like accept_invitation; contract end ≥ start.
- `update_employee_document(p_employee uuid, p_identity_type, p_number, p_iqama_expiry, p_entry_date)` — HR path (`employees.edit`) or self; self change notifies HR holders (`type 'document_updated'`); reuses `set_employee_identity`.
- `update_my_email(p_email text)`.
- [ ] Failing tests: HR edits name; employee cannot edit own name (no RPC path); self iqama update stores encrypted + HR notified; invalid number → `ORG_VALIDATION`; border→iqama conversion clears entry_date requirement. → implement → pass → commit.

### Task 6: My profile + direct manager
**Files:** `supabase/migrations/0019_my_profile.sql`; test `supabase/tests/my-profile.test.ts`.
- `direct_manager(p_employee uuid) returns uuid` — SQL mirror of shared `resolveDirectManager` (walk up units, skip self/vacant).
- `my_profile() returns jsonb` — me (name, phone, email, birth, nationality, document type, last4, iqama_expiry, entry_date, contract dates), job (title, unit, branch, role name), manager `{name, title, phone?}` (phone only when manager's position `show_phone_to_reports`), and my requests (latest 20).
- [ ] Failing tests: section employee gets department manager; vacant manager → next up; phone hidden by default, shown when flag on; employee of company A never sees B data. → implement → pass → commit.

### Task 7: Shared + routing for terminated users
**Files:** `packages/shared/src/permissions.ts` (labels), `apps/web/src/lib/role-matrix.ts`, `apps/web/src/lib/routing.ts`, `apps/web/src/lib/dates.ts`, migration `0020_session_state_v2.sql` (`session_state` adds `is_terminated`), tests `apps/web/test/routing.test.ts`, `apps/web/test/dates.test.ts`, `apps/web/test/role-matrix.test.ts`.
- `routeFor` gets `isTerminated`: user with no active employee but terminated → `/ended` (public page with "انتهت خدمتك في {company}" + logout).
- `daysUntil(date: string, today = new Date()): number` and `expiryTone(days): 'red'|'amber'|'green'` (red < 30, amber < 90).
- Arabic labels for the 4 new permissions.
- [ ] Failing tests → implement → pass → commit.

### Task 8: Web — employee actions
**Files:** `apps/web/src/app/app/employees/[id]/*`, `src/components/terminate-dialog.tsx`, `transfer-dialog.tsx`, `employee-edit-form.tsx`, `src/app/app/employees/page.tsx` (filter نشط / منتهية خدمتهم).
- Buttons by permission: direct (`employees.terminate`/`employees.transfer`) vs request (`request_*`) — same dialogs, submit → `terminate_employee`/`transfer_employee` or `submit_request`.
- Transfer dialog: destination unit → vacant positions list or "منصب جديد" (title + `assignableRoles`), timing فوري / في تاريخ.
- [ ] Pure helper `destinationOptions(tree, positions, unitId)` tested (only vacant positions of that unit) → implement UI → typecheck/build → commit.

### Task 9: Web — requests pages
**Files:** `src/app/app/requests/page.tsx` (الطلبات الواردة), `src/app/app/requests/mine/page.tsx` (طلباتي), `src/components/decide-dialog.tsx`, `src/lib/requests.ts`, nav items.
- `requestStatusBadge(status)`, `requestSummary(req)` tested; nav: "الطلبات الواردة" if `requests.decide`; "طلباتي" for everyone with any `request_*` grant; bell handles `request_new` / `request_decided` / `document_updated` / `scheduled_failed`.
- [ ] Failing tests → implement → typecheck/build → commit.

### Task 10: Web — بياناتي + position phone toggle
**Files:** `src/app/app/me/page.tsx`, `src/components/update-document-form.tsx`, `positions-panel.tsx` (checkbox "إظهار رقم الجوال للموظفين التابعين"), nav item "بياناتي" (first for everyone).
- [ ] Component test: document card shows red countdown under 30 days → implement → build → commit.

### Task 11: Deploy + verify
- [ ] Apply 0014–0020 with Supabase MCP; `get_advisors` → no ERROR; schedule cron: `select cron.schedule('org-bu-scheduled-actions','5 21 * * *','select public.run_scheduled_actions()')` (enable `pg_cron` extension first).
- [ ] Full suites (shared, DB, web) + `cf:build` pass; push to `main`.
- [ ] Owner checklist (manual, on hosted URL): HR terminates (today/future, cancel), branch manager requests termination → HR approves, transfer immediate + scheduled, employee updates iqama, بياناتي shows manager.
