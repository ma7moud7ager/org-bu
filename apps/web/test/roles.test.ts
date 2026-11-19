import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_GRANTS } from '@orgbu/shared';
import { assignableRoles, type RoleOption } from '@/lib/roles';
import { inviteUrl, whatsappShareUrl } from '@/lib/share';

const roles: RoleOption[] = Object.entries(DEFAULT_ROLE_GRANTS).map(([k, gs]) => ({
  id: k, name: k, systemKey: k, permissions: gs.map((g) => g.permission),
}));

describe('assignableRoles', () => {
  it('hr cannot assign company_admin', () => {
    const ids = assignableRoles(roles, DEFAULT_ROLE_GRANTS.hr).map((r) => r.id);
    expect(ids).not.toContain('company_admin');
    expect(ids).toEqual(expect.arrayContaining(['employee', 'hr']));
  });
  it('company admin can assign every role', () => {
    expect(assignableRoles(roles, DEFAULT_ROLE_GRANTS.company_admin)).toHaveLength(6);
  });
});

describe('share links', () => {
  it('builds the invite url', () => expect(inviteUrl('https://x.sa', 'tok')).toBe('https://x.sa/invite/tok'));
  it('builds a WhatsApp share url', () =>
    expect(whatsappShareUrl('مرحبا a&b')).toBe('https://wa.me/?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20a%26b'));
});
