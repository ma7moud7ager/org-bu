import { createServerSupabase } from '@/lib/supabase/server';
import { DeviceCheck, type MyDevice } from './device-check';

export default async function DevicePage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('my_device');
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">جاهزية الجهاز</h1>
      <DeviceCheck bound={data as MyDevice} />
    </div>
  );
}
