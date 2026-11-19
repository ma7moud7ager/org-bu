import type { ActorContext, Grant } from '@orgbu/shared';

export type ActorBundle = {
  employee: { id: string; fullName: string; companyId: string; positionId: string };
  actor: ActorContext;
  grants: Grant[];
  companyName: string;
  writable: boolean;
};

export function hasGrant(grants: Grant[], permission: string, notScope?: string): boolean {
  return grants.some((g) => g.permission === permission && g.scope !== notScope);
}
