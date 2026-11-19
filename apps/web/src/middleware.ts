import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { routeFor } from '@/lib/routing';

export async function middleware(req: NextRequest) {
  const { response, supabase, userId } = await updateSession(req);
  let hasEmployee = false;
  let isPlatformAdmin = false;
  if (userId) {
    const [emp, admin] = await Promise.all([supabase.rpc('current_employee'), supabase.rpc('is_platform_admin')]);
    hasEmployee = !!(emp.data as { id?: string } | null)?.id;
    isPlatformAdmin = admin.data === true;
  }
  const target = routeFor(req.nextUrl.pathname, { userId, hasEmployee, isPlatformAdmin });
  if (target) return NextResponse.redirect(new URL(target, req.url));
  return response();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
};
