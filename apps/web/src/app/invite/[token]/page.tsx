import { createServerSupabase } from '@/lib/supabase/server';
import { toArabicError } from '@/lib/errors';
import { Card, ErrorText } from '@/components/ui';
import { InviteFlow } from '@/components/invite-flow';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createServerSupabase();
  const [{ data, error }, { data: user }] = await Promise.all([
    supabase.rpc('preview_invitation', { p_token: token }),
    supabase.auth.getUser(),
  ]);
  const preview = (data as Array<{ company_name: string; unit_name: string; position_title: string }> | null)?.[0];
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-6">
        <h1 className="text-xl font-bold text-teal-800">دعوة للانضمام</h1>
        {error || !preview ? (
          <ErrorText>{toArabicError(error ?? { message: 'ORG_INVITE_INVALID' })}</ErrorText>
        ) : (
          <>
            <div className="rounded-lg bg-teal-50 p-4 text-sm">
              <p className="font-bold">{preview.company_name}</p>
              <p>{preview.position_title} — {preview.unit_name}</p>
            </div>
            <InviteFlow token={token} signedIn={!!user.user} />
          </>
        )}
      </Card>
    </main>
  );
}
