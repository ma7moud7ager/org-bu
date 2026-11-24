'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { callRpc, type Result } from '@/lib/errors';
import type { AttendanceResult } from '@/lib/attendance';

export async function recordAttendance(kind: 'in' | 'out', pos: { lat: number; lng: number; accuracy: number; isMock: boolean } | null,
                                       biometricOk: boolean, deviceId: string): Promise<Result<AttendanceResult>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<Omit<AttendanceResult, 'kind'>>(supabase, 'record_attendance', {
    p_kind: kind, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_accuracy: pos?.accuracy ?? null,
    p_is_mock: pos?.isMock ?? false, p_biometric_ok: biometricOk, p_device_id: deviceId,
  });
  revalidatePath('/app/attendance');
  return r.ok ? { ok: true, data: { ...r.data, kind } } : r;
}

export async function setUnitLocation(unitId: string, lat: number | null, lng: number | null, radius: number): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'set_unit_location', { p_unit: unitId, p_lat: lat, p_lng: lng, p_radius: radius });
  if (r.ok) revalidatePath('/app/structure');
  return r;
}

export async function unbindDevice(employeeId: string): Promise<Result<null>> {
  const supabase = await createServerSupabase();
  const r = await callRpc<null>(supabase, 'unbind_device', { p_employee: employeeId });
  if (r.ok) revalidatePath(`/app/employees/${employeeId}`);
  return r;
}
