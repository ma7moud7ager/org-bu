import { describe, it, expect } from 'vitest';
import { EMPLOYEES_LIST_SELECT } from '@/lib/queries';

describe('PostgREST selects', () => {
  it('employees list names the positions→org_units foreign key (two FKs link these tables)', () => {
    expect(EMPLOYEES_LIST_SELECT).toContain('org_units!positions_org_unit_id_fkey(name)');
  });
});
