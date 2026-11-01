-- Checks what sync_divvy saves. Run it in the Supabase SQL editor or through the MCP server.
-- It always ends by raising an exception, which rolls back everything it did. Success reads "ALL PASSED".
do $$
declare
  stations_a constant jsonb := '[
    {"station_id":"a","name":"Station A","lat":41.9,"lon":-87.6,"capacity":15},
    {"station_id":"b","name":"Station B","lat":41.8,"lon":-87.7,"capacity":19}
  ]';
  statuses_a constant jsonb := '[
    {"station_id":"a","bikes":10,"ebikes":2,"docks":4,"is_renting":true,"is_returning":true,"last_reported":"2026-11-01T12:00:00Z"},
    {"station_id":"b","bikes":3,"ebikes":0,"docks":16,"is_renting":true,"is_returning":true,"last_reported":"2026-11-01T12:00:00Z"}
  ]';
  result jsonb;
  n integer;
begin
  delete from public.stations;

  result := public.sync_divvy(stations_a, statuses_a);
  assert result = '{"stations_changed":2,"stations_removed":0,"statuses_changed":2}', 'first run should save everything: ' || result;

  update public.station_status set updated_at = '2000-01-01';
  update public.stations set updated_at = '2000-01-01';

  result := public.sync_divvy(stations_a, statuses_a);
  assert result = '{"stations_changed":0,"stations_removed":0,"statuses_changed":0}', 'identical data should save nothing: ' || result;
  select count(*) into n from public.station_status where updated_at = '2000-01-01';
  assert n = 2, 'identical data should not touch any status row';

  result := public.sync_divvy(stations_a, jsonb_set(jsonb_set(statuses_a, '{0,last_reported}', '"2026-11-01T12:05:00Z"'), '{1,last_reported}', '"2026-11-01T12:05:00Z"'));
  assert result ->> 'statuses_changed' = '0', 'a new last_reported alone should save nothing: ' || result;
  select count(*) into n from public.station_status where last_reported = '2026-11-01T12:00:00Z';
  assert n = 2, 'a new last_reported alone should leave the rows as they were';

  result := public.sync_divvy(stations_a, jsonb_set(statuses_a, '{0,bikes}', '11'));
  assert result ->> 'statuses_changed' = '1', 'one bike moving should save one row: ' || result;
  select bikes into n from public.station_status where station_id = 'a';
  assert n = 11, 'the new bike count should be saved';
  select count(*) into n from public.station_status where updated_at = '2000-01-01';
  assert n = 1, 'the unchanged station should not be touched';

  result := public.sync_divvy(stations_a, jsonb_set(jsonb_set(statuses_a, '{0,bikes}', '11'), '{1,is_renting}', 'false'));
  assert result ->> 'statuses_changed' = '1', 'a station closing should save one row: ' || result;
  select count(*) into n from public.station_status where station_id = 'b' and not is_renting;
  assert n = 1, 'the closed flag should be saved';

  result := public.sync_divvy(jsonb_set(stations_a, '{0,capacity}', '23'), statuses_a);
  assert result ->> 'stations_changed' = '1', 'a capacity change should save one station: ' || result;

  result := public.sync_divvy(stations_a, statuses_a || '[{"station_id":"unknown","bikes":1,"ebikes":0,"docks":1,"is_renting":true,"is_returning":true,"last_reported":null}]');
  select count(*) into n from public.station_status where station_id = 'unknown';
  assert n = 0, 'a status for an unknown station should be skipped';

  result := public.sync_divvy(stations_a #- '{1}', statuses_a #- '{1}');
  assert result ->> 'stations_removed' = '1', 'a station leaving the feed should be removed: ' || result;
  select count(*) into n from public.station_status where station_id = 'b';
  assert n = 0, 'a removed station should lose its status row too';

  result := public.sync_divvy(stations_a || '[{"station_id":"c","name":"C","lat":41,"lon":-87,"capacity":9},{"station_id":"d","name":"D","lat":41,"lon":-87,"capacity":9}]', '[]');
  begin
    result := public.sync_divvy(stations_a #- '{1}', '[]');
    assert false, 'a feed with under half the saved stations should be refused';
  exception when raise_exception then
    assert sqlerrm like 'Feed lists 1 stations but 4 are saved', 'unexpected error: ' || sqlerrm;
  end;
  select count(*) into n from public.stations;
  assert n = 4, 'a refused feed should delete nothing';

  assert not has_function_privilege('authenticated', 'public.sync_divvy(jsonb, jsonb)', 'execute'), 'signed-in people must not be able to save data';
  assert not has_function_privilege('anon', 'public.sync_divvy(jsonb, jsonb)', 'execute'), 'visitors must not be able to save data';
  assert not has_function_privilege('authenticated', 'public.worker_token_is_valid(text)', 'execute'), 'signed-in people must not be able to check tokens';
  assert not has_function_privilege('anon', 'public.worker_token_is_valid(text)', 'execute'), 'visitors must not be able to check tokens';
  assert has_function_privilege('service_role', 'public.sync_divvy(jsonb, jsonb)', 'execute'), 'the worker must be able to save data';
  assert not public.worker_token_is_valid('wrong-token'), 'a wrong token must be refused';

  raise exception 'ALL PASSED (test data rolled back)';
end $$;
