import { hasPermission, type ActorContext, type Grant, type Target } from '@orgbu/shared';

export type Mode = 'direct' | 'request' | null;
export type ActionModes = { terminate: Mode; transfer: Mode; edit: boolean };

/** UI gating only; the database re-checks every action. */
export function actionModes(grants: Grant[], actor: ActorContext, target: Target, writable: boolean): ActionModes {
  if (!writable) return { terminate: null, transfer: null, edit: false };
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(grants, p, actor, target);
  const self = target.employeeId === actor.employeeId;
  const mode = (direct: Parameters<typeof hasPermission>[1], request: Parameters<typeof hasPermission>[1]): Mode =>
    self ? null : can(direct) ? 'direct' : can(request) ? 'request' : null;
  return {
    terminate: mode('employees.terminate', 'employees.request_terminate'),
    transfer: mode('employees.transfer', 'employees.request_transfer'),
    edit: can('employees.edit'),
  };
}

export type PositionOption = { id: string; unitId: string; title: string; employeeId: string | null };

export function destinationOptions(positions: PositionOption[], unitId: string, currentPositionId: string | null): PositionOption[] {
  return positions.filter((p) => p.unitId === unitId && !p.employeeId && p.id !== currentPositionId);
}

export type TransferForm = {
  mode: 'vacant' | 'new'; targetPosition: string; unitId: string; title: string; roleId: string; when: 'now' | 'date'; date: string;
};
export type TransferPayload =
  | { target_position: string; run_at: string | null }
  | { new_unit: string; new_title: string; new_role: string; run_at: string | null };

/** Payload shared by transfer_employee and submit_request('transfer'); null when the form is incomplete. */
export function transferPayload(f: TransferForm): TransferPayload | null {
  const runAt = f.when === 'date' ? f.date || null : null;
  if (f.when === 'date' && !runAt) return null;
  if (f.mode === 'vacant') return f.targetPosition ? { target_position: f.targetPosition, run_at: runAt } : null;
  const title = f.title.trim();
  if (!f.unitId || title.length < 2 || !f.roleId) return null;
  return { new_unit: f.unitId, new_title: title, new_role: f.roleId, run_at: runAt };
}

export const TERMINATION_REASONS = [
  { value: 'resignation', label: 'استقالة' },
  { value: 'dismissal', label: 'إنهاء من الشركة' },
  { value: 'contract_end', label: 'انتهاء العقد' },
  { value: 'probation', label: 'عدم اجتياز فترة التجربة' },
  { value: 'other', label: 'أخرى' },
] as const;
export type TerminationReason = (typeof TERMINATION_REASONS)[number]['value'];

export const reasonLabel = (v: string | null) => TERMINATION_REASONS.find((r) => r.value === v)?.label ?? '—';
