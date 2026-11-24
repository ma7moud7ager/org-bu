'use server';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, type Result } from '@/lib/errors';

export type BindResult = 'bound' | 'ok' | 'mismatch';

export async function registerDevice(deviceId: string, platform: string, model: string | null, pushToken: string | null): Promise<Result<BindResult>> {
  const supabase = await createServerSupabase();
  return callRpc<BindResult>(supabase, 'register_device', { p_device_id: deviceId, p_platform: platform, p_model: model, p_push_token: pushToken });
}
