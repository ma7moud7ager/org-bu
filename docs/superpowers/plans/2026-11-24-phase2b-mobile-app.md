# Phase 2b — Android App (Capacitor shell) + Device Binding + Push + Basic Attendance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An Android app that opens the hosted platform with native biometric, location (with mock detection), push and one-phone binding, plus basic check-in/check-out inside the branch geofence and an HR attendance log.

**Architecture:** `apps/mobile` is a Capacitor 8 shell whose `server.url` is the Cloudflare site; the web app talks to native plugins only through `apps/web/src/lib/native.ts`. All rules (binding, geofence, ordering) live in Postgres RPCs tested on local PG16. Push: insert into `notifications` → trigger → `pg_net` → Edge Function `push` → FCM.

**Tech Stack:** as Phase 2a + Capacitor 8 (`@capacitor/core|android|ios|app|device|geolocation|push-notifications`, a biometric plugin), Java plugin for mock location, GitHub Actions (JDK 21, Node 22), Supabase Edge Functions (Deno) + `pg_net`.

**Spec:** `docs/superpowers/specs/2026-11-24-phase2b-mobile-app-design.md`. **Reference:** `/home/claude/sha7n-web/mobile`, `/home/claude/sha7n-web/.github/workflows/android.yml`.

## Global Constraints
- `appId` `com.orgbu.app`, `appName` `org BU`, `server.url` `https://org-bu.mahmoud-m-hager.workers.dev`; navigation limited to that host; external links open in the system browser.
- Device status values: `active`, `revoked`; at most one `active` device per employee (partial unique index).
- New request type `device_change` (requester = subject = the employee).
- Attendance kinds `in`, `out`; results `accepted`, `rejected`; reject reasons (exact): `device`, `biometric`, `mock`, `accuracy`, `no_location`, `outside`, `sequence`.
- Accuracy limit 100 m; default radius 100 m; boundary values accepted (`<=`).
- Geofence = nearest unit on the employee's unit path (deepest first) with `geo_lat/geo_lng` set.
- Notification types added: `attendance_rejected`, and `request_new`/`request_decided` now also carry `type: 'device_change'`.
- APK path `apps/web/public/downloads/org-bu.apk`; signed with a committed test keystore (sha7n pattern) so updates install over old versions.
- Push only active when `apps/mobile/android/app/google-services.json` exists (sha7n pattern); dispatch is a no-op when `pg_net` or `internal_config` is missing (local tests).
- Biometric/face data never leaves the phone; the server receives only `biometric_ok`.

## Review Focus
1. Second phone while the first is bound → `register_device` returns `mismatch`, one open `device_change` request, no push token stored for it, and `record_attendance` from it is rejected with `device` (Task 2/3 tests).
2. Employee transferred to another branch → next check-in uses the new branch's geofence (Task 3 test).
3. Boundary values: accuracy = 100 and distance = radius are accepted (Task 3 test).
4. HR approves a `device_change` after another phone was bound meanwhile → the requested phone becomes active, the current one revoked (Task 2 test).
5. Terminated employee → device revoked and `record_attendance` → `ORG_FORBIDDEN` (Task 2/3 tests).

---

### Task 1: Shared geo + notification text
**Files:** `packages/shared/src/geo.ts`, `packages/shared/src/notifications.ts`, export from `index.ts`; `apps/web/src/lib/notifications.ts` re-exports `notificationView`; tests `packages/shared/test/geo.test.ts`, `packages/shared/test/notifications.test.ts`.
- `haversineMeters(a: {lat,lng}, b: {lat,lng}): number`; `parseMapsLink(url: string): {lat,lng} | null` (handles `@lat,lng`, `?q=lat,lng`, `ll=`, plain `lat, lng`).
- `notificationView(n)` moves to shared unchanged + new `attendance_rejected` ("تم رفض تسجيل {حضور|انصراف} لـ {employee_name}: {reason label}" → `/app/attendance`) and `device_change` wording for request types ("تغيير الجوال"). `ATTENDANCE_REASON_AR` map for the 7 reasons.
- [ ] Failing tests (Riyadh↔Jeddah ≈ 845 km ±5; 0 for same point; parse 3 link styles + garbage → null; new notification texts) → implement → shared + web tests pass → commit.

### Task 2: Devices + device_change requests
**Files:** `supabase/migrations/0023_devices.sql`; test `supabase/tests/devices.test.ts`.
- `employee_devices(id, company_id, employee_id, device_id text, platform text check in ('android','ios'), model text, push_token text, bound_at, last_seen_at, status)`; RLS select: own rows, or `employees.view` on the employee; no direct writes.
- `register_device(p_device_id text, p_platform text, p_model text, p_push_token text) returns text` → `'bound' | 'ok' | 'mismatch'`. Mismatch creates (once) `requests(type 'device_change', requester=subject=me, payload {device_id, platform, model})` + `request_new` to `requests.decide` holders.
- Extend `requests.type` check; `normalize_request_payload` handles `device_change`; `decide_request` approve → `private.apply_device_change(employee, payload)` (revoke current active, insert new active). Direct `submit_request('device_change', …)` stays forbidden.
- `unbind_device(p_employee uuid)` (`employees.edit`); `my_device() returns jsonb` ({status: 'none'|'active', device_id, model, bound_at, pending_change: bool}); `employee_device(p_employee) returns jsonb` for the HR page.
- `private.apply_termination` also revokes devices.
- [ ] Failing tests: first bind; same device updates token/last_seen; mismatch → request + HR notified + second mismatch no duplicate; approve rebinds (Review Focus #4); reject keeps old; unbind then next phone binds; termination revokes (#5); other company cannot see/unbind; `submit_request('device_change')` → ORG_VALIDATION → implement → pass → commit.

### Task 3: Geofence + attendance
**Files:** `supabase/migrations/0024_attendance.sql`; test `supabase/tests/attendance.test.ts`.
- `org_units` + `geo_lat double precision, geo_lng double precision, geo_radius_m int not null default 100 check (geo_radius_m between 20 and 2000)`.
- `set_unit_location(p_unit uuid, p_lat double precision, p_lng double precision, p_radius int)` (`structure.manage`; null lat/lng clears); validates ranges.
- SQL `private.distance_m(lat1,lng1,lat2,lng2)` (haversine, same formula as shared); `private.employee_geofence(p_employee) returns record (unit_id, lat, lng, radius)`.
- `attendance_records(id, company_id, employee_id, kind, at, lat, lng, accuracy_m, distance_m, unit_id, device_id, result, reason)`; RLS select: own, or `employees.view` on the employee's unit.
- `record_attendance(p_kind text, p_lat, p_lng, p_accuracy, p_is_mock boolean, p_biometric_ok boolean, p_device_id text) returns jsonb` ({result, reason, distance_m, at}). Check order: device → biometric → mock → accuracy → no_location → outside → sequence (last accepted record today, Riyadh date, must be the opposite kind; first of the day must be `in`). Always inserts a row; rejected → `attendance_rejected` to employee and `direct_manager` (if any).
- `my_attendance_today() returns jsonb` (records + next kind); `attendance_day(p_date date, p_unit uuid default null) returns jsonb` per visible employee: first_in, last_out, rejected list (filtered by `employees.view` scope; branch manager → own branch).
- [ ] Failing tests: accepted inside; outside → `outside`; branch employee uses branch fence, head-office employee uses root fence; no fence → `no_location`; unbound device → `device`; mock; accuracy 101 rejected and 100 accepted, distance = radius accepted (#3); out-before-in and in-in → `sequence`; reject notifies employee + manager; transfer → new fence (#2); terminated → ORG_FORBIDDEN (#5); `attendance_day` HR sees all, branch manager own branch only → implement → pass → commit.

### Task 4: Push dispatch + Edge Function
**Files:** `supabase/migrations/0025_push.sql`; `supabase/functions/push/index.ts`, `supabase/functions/push/notification-view.ts` (generated copy), `scripts/sync-push-view.mjs`; tests `supabase/tests/push.test.ts`, `packages/shared/test/push-copy.test.ts`.
- `private.internal_config(key text primary key, value text)`; trigger `notifications_push` after insert → `private.dispatch_push(new.id)`: returns without error when `to_regproc('net.http_post')` is null or `push_url`/`push_secret` config missing; otherwise `net.http_post(push_url, {notification_id}, headers {x-push-secret})`.
- Edge Function: checks `x-push-secret` against env `PUSH_SECRET`; loads notification + the user's active device token (service role); builds text with `notificationView`; sends FCM HTTP v1 using env `FCM_SERVICE_ACCOUNT` (JSON); data payload `{href}`; on `UNREGISTERED`/404 clears the token. No secret → 401.
- `scripts/sync-push-view.mjs` copies shared `notifications.ts` (+ reasons) into the function folder; the copy test fails if the two differ.
- [ ] Failing tests: insert notification locally succeeds (no pg_net) and writes nothing extra; copy test → implement → pass → commit.

### Task 5: Mobile shell + CI
**Files:** `apps/mobile/{package.json,capacitor.config.json,www/index.html,prepare.js}`, `apps/mobile/android/**` (generated by `npx cap add android`, then edited), `apps/mobile/android/app/src/main/java/com/orgbu/app/{MainActivity.java,MockLocationPlugin.java}`, `apps/mobile/android/app/orgbu-test.jks`, `.github/workflows/android.yml`, `apps/web/public/.well-known/assetlinks.json`, `pnpm-workspace.yaml` (exclude `apps/mobile`, it uses npm like sha7n).
- Capacitor config: `server.url`, `allowNavigation` [host], `androidScheme https`, plugins config; `www/index.html` = offline page (Arabic, retry button reloading `server.url`).
- `MockLocationPlugin.getCurrentPosition()` → `{lat, lng, accuracy, isMock}` (uses `Location.isMock()` on API 31+, `isFromMockProvider()` below); permission request handled by the plugin.
- Gradle: test keystore signing for debug/release (sha7n pattern); `google-services` plugin applied only if the json exists; manifest: location permissions, App Links intent filter for `/invite/*` with `autoVerify`.
- Workflow: triggers on `apps/mobile/**` and the workflow file + manual; Node 22 / JDK 21; `npm ci && npx cap sync android && ./gradlew assembleRelease`; copies APK to `apps/web/public/downloads/org-bu.apk`, commits as bot, pushes; failure → `build-logs` branch; `versionCode` = `run_number`.
- `assetlinks.json` with the test key SHA-256 (from `keytool -list`).
- [ ] Verify locally: `npx cap sync android` succeeds; `keytool -list` prints fingerprint; workflow YAML parses (`node -e` with `yaml`) → commit → (CI run happens after push in Task 8).

### Task 6: Web native bridge + device registration
**Files:** `apps/web/src/lib/native.ts`, `apps/web/src/components/native-boot.tsx` (mounted in `src/app/app/layout.tsx`), `apps/web/src/app/app/device-actions.ts`; tests `apps/web/test/native.test.ts`.
- `isNativeApp(): boolean`; `deviceInfo(): Promise<{id, platform, model} | null>`; `biometric(): {available(): Promise<boolean>, verify(reason: string): Promise<boolean>}`; `currentLocation(): Promise<{lat,lng,accuracy,isMock} | {error: 'denied'|'unavailable'}>`; `registerPush(onToken, onTap)`; all return null/unavailable when `window.Capacitor?.isNativePlatform?.()` is falsy.
- `NativeBoot`: in the app only, after login: get device info + push token → server action `registerDevice` → stores result in a small client store; shows the mismatch banner text from the spec; push tap → `router.push(href)`; external links → system browser.
- [ ] Failing tests (browser: `isNativeApp` false, `currentLocation` → unavailable, `deviceInfo` null; with a fake `window.Capacitor` + plugin stubs: values pass through, `isMock` preserved) → implement → typecheck → commit.

### Task 7: Web pages
**Files:** `src/app/app/attendance/page.tsx` + `attendance-button.tsx` (حضوري), `src/app/app/attendance/log/page.tsx` (سجل الحضور), `src/app/app/device/page.tsx` (جاهزية الجهاز), `src/components/unit-location-form.tsx` (in the structure unit panel), employee page device card + unbind, `src/app/download/page.tsx` (public, added to `isPublic` in routing), "حمّل التطبيق" link in sidebar (browser only), nav items, `src/lib/attendance.ts`; tests `apps/web/test/attendance.test.ts`, `apps/web/test/routing.test.ts` (+ `/download` public), `apps/web/test/nav.test.ts`.
- `attendanceSummary(records)` → first in, last out, worked minutes for accepted pairs; `reasonLabel` from shared.
- Nav: "حضوري" for everyone (page shows "سجّل من التطبيق" in the browser), "سجل الحضور" for `employees.view` beyond self; "جاهزية الجهاز" rendered client-side only in the app.
- Location form: "استخدم موقعي الحالي" (app only) or paste a Maps link (parsed with `parseMapsLink`), radius input.
- [ ] Failing tests → implement → typecheck + build → commit.

### Task 8: Deploy + Mahmoud's steps
- [ ] Apply 0023–0025 to Supabase; enable `pg_net`; insert `push_url` + random `push_secret` into `private.internal_config`; deploy Edge Function `push` (secret `PUSH_SECRET`); `get_advisors` → no ERROR.
- [ ] All suites + `cf:build`; push `main`; read the Android workflow result (`git fetch` of `main` for the APK commit, or `build-logs` on failure) and fix until the APK is published.
- [ ] Write `docs/runbooks/mobile-firebase.md`: numbered steps (Firebase project → Android app `com.orgbu.app` → download `google-services.json` → send to Claude; Service account key → Supabase secret `FCM_SERVICE_ACCOUNT`); owner checklist for phone testing.
