import { notFound } from 'next/navigation';
import { hasPermission, type PositionRef } from '@orgbu/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadActor, toOrgUnit, type UnitRow } from '@/lib/actor';
import { IDENTITY_TYPE_AR, maskIdentity } from '@/lib/format';
import { actionModes, reasonLabel, type PositionOption } from '@/lib/employee-actions';
import { assignableRoles, type RoleOption } from '@/lib/roles';
import { buildTree, withPaths } from '@/lib/tree';
import { Card } from '@/components/ui';
import { EmployeeSensitive } from '@/components/employee-sensitive';
import { EmployeeEditForm } from '@/components/employee-edit-form';
import { TerminateDialog } from '@/components/terminate-dialog';
import { TransferDialog, type UnitOption } from '@/components/transfer-dialog';
import { ScheduledActionBanner } from '@/components/scheduled-action-banner';
import { EmployeeDeviceCard, type EmployeeDevice } from '@/components/employee-device-card';

type Emp = {
  id: string; full_name: string; phone: string; email: string | null; birth_date: string | null; gender: string | null; nationality: string | null;
  identity_type: string | null; identity_last4: string | null; iqama_expiry: string | null; entry_date: string | null;
  contract_start: string | null; contract_end: string | null; status: string; position_id: string | null;
  termination_reason: string | null; termination_note: string | null; last_working_day: string | null;
  positions: { title: string; org_unit_id: string } | null;
};
type Scheduled = { id: string; kind: 'termination' | 'transfer'; run_at: string };
type PosRow = { id: string; org_unit_id: string; title: string; is_manager: boolean; employees: { id: string } | null };
type RoleRow = { id: string; name: string; system_key: string | null; role_permissions: Array<{ permission: string }> };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const bundle = (await loadActor())!;
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, phone, email, birth_date, gender, nationality, identity_type, identity_last4, iqama_expiry, entry_date, contract_start, contract_end, status, position_id, termination_reason, termination_note, last_working_day, positions(title, org_unit_id)')
    .eq('id', id)
    .maybeSingle();
  const e = data as unknown as Emp | null;
  if (!e) notFound();
  const unitId = e.positions?.org_unit_id;
  const [{ data: path }, { data: branch }, { data: sched }, { data: device }] = await Promise.all([
    unitId ? supabase.rpc('unit_path', { p_unit: unitId }) : Promise.resolve({ data: [] }),
    unitId ? supabase.rpc('unit_branch', { p_unit: unitId }) : Promise.resolve({ data: null }),
    supabase.from('scheduled_actions').select('id, kind, run_at').eq('employee_id', id).eq('status', 'scheduled').order('run_at'),
    supabase.rpc('employee_device', { p_employee: id }),
  ]);
  const target = { employeeId: e.id, unitPath: (path as string[]) ?? [], branchId: (branch as string | null) ?? null };
  const active = e.status === 'active';
  const canSee = hasPermission(bundle.grants, 'employees.view_sensitive', bundle.actor, target);
  const modes = active ? actionModes(bundle.grants, bundle.actor, target, bundle.writable) : { terminate: null, transfer: null, edit: false };
  const scheduled = (sched ?? []) as Scheduled[];

  let transferProps: { units: UnitOption[]; positions: PositionOption[]; roles: Array<{ id: string; name: string }> } | null = null;
  if (modes.transfer) {
    const [units, positions, roles] = await Promise.all([
      supabase.from('org_units').select('id, parent_id, type, name, is_fixed, manager_position_id'),
      supabase.from('positions').select('id, org_unit_id, title, is_manager, employees(id)'),
      supabase.from('roles').select('id, name, system_key, role_permissions(permission)'),
    ]);
    const posRows = (positions.data ?? []) as unknown as PosRow[];
    const refs: PositionRef[] = posRows.map((p) => ({ id: p.id, unitId: p.org_unit_id, isManager: p.is_manager, employeeId: p.employees?.id ?? null }));
    const tree = buildTree(((units.data ?? []) as UnitRow[]).map(toOrgUnit), refs);
    const allowed = withPaths(tree).filter(({ unitPath, branchId }) =>
      modes.transfer === 'request' || hasPermission(bundle.grants, 'employees.transfer', bundle.actor, { unitPath, branchId }));
    const byId = new Map(withPaths(tree).map((x) => [x.node.id, x.node.name]));
    const roleOptions: RoleOption[] = ((roles.data ?? []) as unknown as RoleRow[]).map((r) => ({
      id: r.id, name: r.name, systemKey: r.system_key, permissions: r.role_permissions.map((p) => p.permission),
    }));
    transferProps = {
      units: allowed.map(({ node, unitPath }) => ({ id: node.id, label: unitPath.map((u) => byId.get(u)).join(' ← ') })),
      positions: posRows.map((p) => ({ id: p.id, unitId: p.org_unit_id, title: p.title, employeeId: p.employees?.id ?? null })),
      roles: assignableRoles(roleOptions, bundle.grants).map((r) => ({ id: r.id, name: r.name })),
    };
  }

  const rows: Array<[string, string | null]> = [
    ['المنصب', e.positions?.title ?? null], ['الجوال', e.phone], ['البريد', e.email], ['تاريخ الميلاد', e.birth_date],
    ['النوع', e.gender === 'male' ? 'ذكر' : e.gender === 'female' ? 'أنثى' : null], ['الجنسية', e.nationality],
    ['نوع الوثيقة', e.identity_type ? IDENTITY_TYPE_AR[e.identity_type] ?? e.identity_type : null],
    ['انتهاء الإقامة', e.iqama_expiry], ['تاريخ الدخول', e.entry_date],
    ['بداية العقد', e.contract_start], ['نهاية العقد', e.contract_end],
  ];
  const canCancelTermination = hasPermission(bundle.grants, 'employees.terminate', bundle.actor, target) && bundle.writable;
  const canCancelTransfer = hasPermission(bundle.grants, 'employees.transfer', bundle.actor, target) && bundle.writable;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{e.full_name}</h1>
        {!active ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">منتهية خدمته</span> : null}
      </div>
      {scheduled.map((s) => (
        <ScheduledActionBanner key={s.id} employeeId={e.id} actionId={s.id}
          canCancel={s.kind === 'termination' ? canCancelTermination : canCancelTransfer}
          text={s.kind === 'termination'
            ? `إنهاء خدمة مجدول — آخر يوم عمل ${s.run_at} (${reasonLabel(e.termination_reason)})`
            : `نقل مجدول بتاريخ ${s.run_at}`} />
      ))}
      {!active ? (
        <Card className="text-sm">
          <p>آخر يوم عمل: {e.last_working_day ?? '—'} — السبب: {reasonLabel(e.termination_reason)}</p>
          {e.termination_note ? <p className="text-slate-500">{e.termination_note}</p> : null}
        </Card>
      ) : null}
      <Card className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-slate-400">{k}</dt><dd>{v ?? '—'}</dd></div>
          ))}
          <div><dt className="text-slate-400">رقم الوثيقة</dt><dd dir="ltr" className="text-end">{maskIdentity(e.identity_last4)}</dd></div>
        </dl>
        {canSee ? <EmployeeSensitive employeeId={e.id} /> : null}
      </Card>
      {active && device ? <EmployeeDeviceCard employeeId={e.id} device={device as EmployeeDevice} canUnbind={modes.edit} /> : null}
      {modes.terminate || modes.transfer ? (
        <div className="flex flex-col gap-3">
          {modes.transfer && transferProps && !scheduled.some((s) => s.kind === 'transfer') ? (
            <TransferDialog employeeId={e.id} mode={modes.transfer} currentPositionId={e.position_id} {...transferProps} />
          ) : null}
          {modes.terminate && !scheduled.some((s) => s.kind === 'termination') ? <TerminateDialog employeeId={e.id} mode={modes.terminate} /> : null}
        </div>
      ) : null}
      {modes.edit ? (
        <EmployeeEditForm employeeId={e.id} initial={{
          full_name: e.full_name, birth_date: e.birth_date, gender: e.gender, nationality: e.nationality, email: e.email,
          contract_start: e.contract_start, contract_end: e.contract_end,
        }} />
      ) : null}
    </div>
  );
}
