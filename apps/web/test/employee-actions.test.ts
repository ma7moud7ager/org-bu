import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_GRANTS } from '@orgbu/shared';
import { actionModes, destinationOptions, TERMINATION_REASONS, transferPayload } from '@/lib/employee-actions';

const target = { employeeId: 'w', unitPath: ['root', 'b1'], branchId: 'b1' };

describe('actionModes', () => {
  it('hr acts directly', () => {
    expect(actionModes(DEFAULT_ROLE_GRANTS.hr, { employeeId: 'h', unitPath: ['root', 'hr'], branchId: null }, target, true))
      .toEqual({ terminate: 'direct', transfer: 'direct', edit: true });
  });
  it('branch manager requests within the branch, nothing elsewhere', () => {
    const bm = { employeeId: 'm', unitPath: ['root', 'b1'], branchId: 'b1' };
    expect(actionModes(DEFAULT_ROLE_GRANTS.branch_manager, bm, target, true)).toEqual({ terminate: 'request', transfer: 'request', edit: true });
    const other = { employeeId: 'x', unitPath: ['root', 'b2'], branchId: 'b2' };
    expect(actionModes(DEFAULT_ROLE_GRANTS.branch_manager, bm, other, true)).toEqual({ terminate: null, transfer: null, edit: false });
  });
  it('nobody acts on themselves; read-only company disables everything', () => {
    const self = { employeeId: 'h', unitPath: ['root', 'hr'], branchId: null };
    expect(actionModes(DEFAULT_ROLE_GRANTS.hr, self, { ...target, employeeId: 'h' }, true)).toMatchObject({ terminate: null, transfer: null });
    expect(actionModes(DEFAULT_ROLE_GRANTS.hr, self, target, false)).toEqual({ terminate: null, transfer: null, edit: false });
  });
});

describe('destinationOptions', () => {
  const positions = [
    { id: 'p1', unitId: 'b2', title: 'كاشير', employeeId: null },
    { id: 'p2', unitId: 'b2', title: 'مشرف', employeeId: 'e9' },
    { id: 'p3', unitId: 'b3', title: 'كاشير', employeeId: null },
    { id: 'cur', unitId: 'b2', title: 'حالي', employeeId: null },
  ];
  it('lists only vacant positions of the chosen unit, excluding the current one', () => {
    expect(destinationOptions(positions, 'b2', 'cur').map((p) => p.id)).toEqual(['p1']);
    expect(destinationOptions(positions, 'b9', 'cur')).toEqual([]);
  });
});

describe('transferPayload', () => {
  it('builds vacant or new-position payloads and the run date', () => {
    expect(transferPayload({ mode: 'vacant', targetPosition: 'p1', unitId: 'b2', title: '', roleId: '', when: 'now', date: '2027-01-01' }))
      .toEqual({ target_position: 'p1', run_at: null });
    expect(transferPayload({ mode: 'new', targetPosition: '', unitId: 'b2', title: ' كاشير ', roleId: 'r', when: 'date', date: '2027-01-01' }))
      .toEqual({ new_unit: 'b2', new_title: 'كاشير', new_role: 'r', run_at: '2027-01-01' });
    expect(transferPayload({ mode: 'vacant', targetPosition: '', unitId: 'b2', title: '', roleId: '', when: 'now', date: '' })).toBeNull();
    expect(transferPayload({ mode: 'new', targetPosition: '', unitId: 'b2', title: 'x', roleId: 'r', when: 'now', date: '' })).toBeNull();
  });
});

it('has Arabic labels for every termination reason', () => {
  expect(TERMINATION_REASONS.map((r) => r.value)).toEqual(['resignation', 'dismissal', 'contract_end', 'probation', 'other']);
});
