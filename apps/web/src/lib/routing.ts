export type SessionState = { userId: string | null; hasEmployee: boolean; isPlatformAdmin: boolean; isTerminated: boolean };

const isPublic = (path: string) => path === '/login' || path.startsWith('/invite/');

export function routeFor(path: string, s: SessionState): string | null {
  if (s.userId && s.hasEmployee && (path === '/login' || path === '/onboarding' || path === '/ended')) return '/app';
  // A user whose service ended (and who is not a platform owner) only sees the "service ended" page.
  if (s.userId && !s.hasEmployee && s.isTerminated && !s.isPlatformAdmin) return path === '/ended' ? null : '/ended';
  if (isPublic(path)) return null;
  if (!s.userId) return `/login?next=${encodeURIComponent(path)}`;

  const ownerOnly = s.isPlatformAdmin && !s.hasEmployee;
  if (path === '/') return ownerOnly ? '/admin/companies' : '/app';
  if (path.startsWith('/admin')) return s.isPlatformAdmin ? null : '/app';
  if (ownerOnly && path.startsWith('/app')) return '/admin/companies';
  if (!s.hasEmployee && path !== '/onboarding') return '/onboarding';
  if (path === '/ended') return '/app';
  return null;
}
