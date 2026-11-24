-- 0025: every new notification is pushed to the user's bound phone (Edge Function "push" via pg_net).
-- Without pg_net or the push config (local tests, before setup) this is a silent no-op.

create table private.internal_config (key text primary key, value text not null);
revoke all on private.internal_config from public, anon, authenticated;

create or replace function private.dispatch_push(p_notification uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_url text := (select value from private.internal_config where key = 'push_url');
  v_secret text := (select value from private.internal_config where key = 'push_secret');
begin
  if to_regproc('net.http_post') is null or v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from public.notifications n join public.employees e on e.user_id = n.user_id
                 join public.employee_devices d on d.employee_id = e.id and d.status = 'active' and d.push_token is not null
                 where n.id = p_notification) then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, jsonb_build_object('notification_id', p_notification),
          jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret);
exception when others then
  return; -- never block the notification itself
end
$$;

create or replace function private.notifications_push_trigger()
returns trigger
language plpgsql security definer set search_path = public, extensions
as $$
begin
  perform private.dispatch_push(new.id);
  return new;
end
$$;

create trigger notifications_push after insert on public.notifications
  for each row execute function private.notifications_push_trigger();

revoke execute on function private.dispatch_push(uuid) from public, anon, authenticated;
revoke execute on function private.notifications_push_trigger() from public, anon, authenticated;

-- The Edge Function (service role) verifies the caller's secret without the secret living in two places.
create or replace function public.check_push_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from private.internal_config where key = 'push_secret' and value = p_secret)
$$;
revoke execute on function public.check_push_secret(text) from public, anon, authenticated;
grant execute on function public.check_push_secret(text) to service_role;
