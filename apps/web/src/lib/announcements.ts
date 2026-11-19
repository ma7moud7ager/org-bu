import { hasPermission, type ActorContext, type Grant } from '@orgbu/shared';
import { withPaths, type TreeNode } from './tree';

export const canPublishCompanyWide = (grants: Grant[]) =>
  grants.some((g) => g.permission === 'announcements.publish' && g.scope === 'company');

export function publishableUnits(tree: TreeNode, grants: Grant[], actor: ActorContext): TreeNode[] {
  return withPaths(tree)
    .filter(({ unitPath, branchId }) => hasPermission(grants, 'announcements.publish', actor, { unitPath, branchId }))
    .map(({ node }) => node);
}
