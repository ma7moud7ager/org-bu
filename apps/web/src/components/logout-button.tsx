'use client';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Button } from '@/components/ui';

export function LogoutButton() {
  async function logout() {
    await createBrowserSupabase().auth.signOut();
    window.location.assign('/login');
  }
  return <Button onClick={logout}>تسجيل الخروج</Button>;
}
