import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { routeFor } from '@/lib/routing';

export async function middleware(req: NextRequest) {
  const { response, supabase, userId } = await updateSession(req);
  let hasEmployee = false;
  let isPlatformAdmin = false;
  if (userId) {
    const { data } = await supabase.rpc('session_state');
    const row = (data as Array<{ has_employee: boolean; is_platform_admin: boolean }> | null)?.[0];
    hasEmployee = row?.has_employee === true;
    isPlatformAdmin = row?.is_platform_admin === true;
  }
  const target = routeFor(req.nextUrl.pathname, { userId, hasEmployee, isPlatformAdmin });
  if (target) return NextResponse.redirect(new URL(target, req.url));
  return response();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
};
