-- Checks how trips earn points and what the leaderboard reveals. Run it in the Supabase SQL editor or through the MCP server.
-- It always ends by raising an exception, which rolls back everything it did. Success reads "ALL PASSED".
do $$
declare
  route_a uuid;
  result jsonb;
  n integer;
  total bigint;
  shown_name text;
  message text;
begin
  -- Test stations far from Chicago, so they can't mix with real ones.
  insert into public.stations (station_id, name, lat, lon, capacity) values
    ('t-full', 'Test Full', 10.001, 10.000, 10),
    ('t-half', 'Test Half', 10.002, 10.000, 10),
    ('t-empty', 'Test Empty', 20.001, 20.000, 10),
    ('t-far', 'Test Far', 10.100, 10.000, 10),
    ('t-rack', 'Public Rack - Test', 10.001, 10.001, 2),
    ('t-closed', 'Test Closed', 10.001, 10.002, 10);
  insert into public.station_status (station_id, bikes, ebikes, docks, is_renting, is_returning) values
    ('t-full', 9, 0, 1, true, true),
    ('t-half', 5, 0, 5, true, true),
    ('t-empty', 1, 0, 9, true, true),
    ('t-far', 9, 0, 1, true, true),
    ('t-rack', 2, 2, 0, true, true),
    ('t-closed', 9, 0, 1, false, false);
  insert into public.routes (user_id, name, start_lat, start_lon, end_lat, end_lon)
    values ('user_a', 'Test route', 10.000, 10.000, 20.000, 20.000) returning id into route_a;
  insert into public.worker_runs (ok, ran_at) values (true, now() + interval '1 minute');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);

  result := public.choose_trip(route_a, 't-full', 't-empty');
  assert (result ->> 'points')::int = 18, 'a full pick-up and empty drop-off should earn 18: ' || result;
  select count(*) into n from public.trips where points = 18 and pickup_points = 9 and dropoff_points = 9 and pickup_name = 'Test Full';
  assert n = 1, 'the trip should be saved with its points';

  begin
    perform public.choose_trip(route_a, 't-half', 't-empty');
    assert false, 'a second trip right away should be refused';
  exception when raise_exception then
    assert sqlerrm like 'You can choose another trip in % min.', 'unexpected: ' || sqlerrm;
  end;

  delete from public.trips;
  result := public.choose_trip(route_a, 't-empty', 't-full', true);
  assert (result ->> 'points')::int = 2, 'a reversed trip should score the stations near the other ends: ' || result;
  delete from public.trips;

  foreach message in array array['t-far|t-empty|half-mile', 't-rack|t-empty|no longer has a bike', 't-closed|t-empty|no longer has a bike', 't-full|t-full|different stations', 't-full|t-closed|no longer has an open dock', 't-full|missing|no longer has an open dock'] loop
    begin
      perform public.choose_trip(route_a, split_part(message, '|', 1), split_part(message, '|', 2));
      assert false, 'this trip should be refused: ' || message;
    exception when raise_exception then
      assert sqlerrm like '%' || split_part(message, '|', 3) || '%', 'unexpected for ' || message || ': ' || sqlerrm;
    end;
  end loop;

  begin
    insert into public.trips (user_id, route_name, pickup_station_id, pickup_name, pickup_points, dropoff_station_id, dropoff_name, dropoff_points, points, miles)
      values ('user_a', 'Fake', 'x', 'x', 10, 'y', 'y', 10, 20, 0);
    assert false, 'a browser must not be able to add a trip directly';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.trips set points = 20;
    assert false, 'a browser must not be able to change its points';
  exception when insufficient_privilege then
    null;
  end;

  result := public.choose_trip(route_a, 't-full', 't-empty');

  select total_points, rider into total, shown_name from public.leaderboard() where is_me;
  assert total >= 18, 'the leaderboard should show my points';
  assert shown_name like 'Rider %', 'without a display name, a rider code should show: ' || shown_name;

  insert into public.profiles (user_id, display_name) values ('user_a', 'Test Rider A');
  select rider into shown_name from public.leaderboard() where is_me;
  assert shown_name = 'Test Rider A', 'a chosen display name should show: ' || shown_name;

  perform set_config('request.jwt.claims', '{"sub":"user_b","role":"authenticated"}', true);

  select count(*) into n from public.trips where user_id = 'user_a';
  assert n = 0, 'B must not see A''s trips';
  select count(*) into n from public.profiles where user_id = 'user_a';
  assert n = 0, 'B must not read A''s profile row';
  update public.profiles set display_name = 'Hacked' where user_id = 'user_a';
  get diagnostics n = row_count;
  assert n = 0, 'B must not rename A';
  delete from public.trips where user_id = 'user_a';
  get diagnostics n = row_count;
  assert n = 0, 'B must not delete A''s trips';

  begin
    perform public.choose_trip(route_a, 't-full', 't-empty');
    assert false, 'B must not use A''s route';
  exception when raise_exception then
    assert sqlerrm = 'Route not found.', 'unexpected: ' || sqlerrm;
  end;

  select count(*) into n from public.leaderboard() where rider = 'Test Rider A' and not is_me;
  assert n = 1, 'B should see A on the leaderboard, but not as themselves';

  begin
    insert into public.profiles (user_id, display_name) values ('user_b', 'test rider a');
    assert false, 'a display name already in use should be refused, whatever its capitals';
  exception when unique_violation then
    null;
  end;

  perform set_config('role', 'none', true);
  insert into public.worker_runs (ok, ran_at, error) values (false, now() + interval '1 hour', 'test failure');
  delete from public.trips where user_id = 'user_a';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
  begin
    perform public.choose_trip(route_a, 't-full', 't-empty');
    assert false, 'no trip should be scored while the worker is down';
  exception when raise_exception then
    assert sqlerrm like 'Bike counts are out of date%', 'unexpected: ' || sqlerrm;
  end;

  perform set_config('role', 'none', true);
  assert not has_function_privilege('anon', 'public.choose_trip(uuid, text, text, boolean)', 'execute'), 'visitors must not be able to choose trips';
  assert not has_function_privilege('anon', 'public.leaderboard()', 'execute'), 'visitors must not see the leaderboard';

  raise exception 'ALL PASSED (test data rolled back)';
end $$;
