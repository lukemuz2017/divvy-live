-- Saves one worker run's data and reports how many rows really changed.
-- The comparison happens here so the worker never has to download every row each minute,
-- which would use up the free plan's data allowance. It all runs in one transaction,
-- so a failed run leaves the tables as they were.
create function public.sync_divvy(stations_in jsonb, statuses_in jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_count integer;
  incoming_count integer := jsonb_array_length(stations_in);
  stations_changed integer;
  stations_removed integer;
  statuses_changed integer;
begin
  -- A feed that suddenly lists far fewer stations is more likely broken than true,
  -- and accepting it would delete those stations.
  select count(*) into saved_count from public.stations;
  if incoming_count < saved_count / 2 then
    raise exception 'Feed lists % stations but % are saved', incoming_count, saved_count;
  end if;

  insert into public.stations (station_id, name, lat, lon, capacity)
  select s.station_id, s.name, s.lat, s.lon, s.capacity
  from jsonb_to_recordset(stations_in)
    as s (station_id text, name text, lat double precision, lon double precision, capacity integer)
  on conflict (station_id) do update
    set name = excluded.name, lat = excluded.lat, lon = excluded.lon, capacity = excluded.capacity, updated_at = now()
    where (public.stations.name, public.stations.lat, public.stations.lon, public.stations.capacity)
      is distinct from (excluded.name, excluded.lat, excluded.lon, excluded.capacity);
  get diagnostics stations_changed = row_count;

  delete from public.stations saved
  where not exists (
    select 1 from jsonb_to_recordset(stations_in) as s (station_id text)
    where s.station_id = saved.station_id
  );
  get diagnostics stations_removed = row_count;

  -- last_reported is saved but left out of the comparison. It changes constantly even when
  -- no bike moved, and comparing it would make most stations look changed.
  insert into public.station_status (station_id, bikes, ebikes, docks, is_renting, is_returning, last_reported)
  select s.station_id, s.bikes, s.ebikes, s.docks, s.is_renting, s.is_returning, s.last_reported
  from jsonb_to_recordset(statuses_in)
    as s (station_id text, bikes integer, ebikes integer, docks integer, is_renting boolean, is_returning boolean, last_reported timestamptz)
  where exists (select 1 from public.stations saved where saved.station_id = s.station_id)
  on conflict (station_id) do update
    set bikes = excluded.bikes, ebikes = excluded.ebikes, docks = excluded.docks,
        is_renting = excluded.is_renting, is_returning = excluded.is_returning,
        last_reported = excluded.last_reported, updated_at = now()
    where (public.station_status.bikes, public.station_status.ebikes, public.station_status.docks,
           public.station_status.is_renting, public.station_status.is_returning)
      is distinct from (excluded.bikes, excluded.ebikes, excluded.docks, excluded.is_renting, excluded.is_returning);
  get diagnostics statuses_changed = row_count;

  return jsonb_build_object(
    'stations_changed', stations_changed,
    'stations_removed', stations_removed,
    'statuses_changed', statuses_changed
  );
end;
$$;

revoke all on function public.sync_divvy(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_divvy(jsonb, jsonb) to service_role;

-- A random token that lets Cron call the worker, so nobody else can trigger runs from its public URL.
-- The database generates it and keeps it in Vault, so it never appears in code.
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'worker_token', 'Lets Supabase Cron call the divvy-worker Edge Function');

create function public.worker_token_is_valid(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'worker_token' and decrypted_secret = token);
$$;

revoke all on function public.worker_token_is_valid(text) from public, anon, authenticated;
grant execute on function public.worker_token_is_valid(text) to service_role;
