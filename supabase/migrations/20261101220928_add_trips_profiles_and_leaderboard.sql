-- A trip someone chose, with the points it earned at that moment. Names are copied in
-- so history still reads correctly if Divvy later renames or removes a station.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  route_name text not null,
  pickup_station_id text not null,
  pickup_name text not null,
  pickup_points integer not null check (pickup_points between 0 and 10),
  dropoff_station_id text not null,
  dropoff_name text not null,
  dropoff_points integer not null check (dropoff_points between 0 and 10),
  points integer not null check (points between 0 and 20),
  miles numeric(4, 1) not null,
  created_at timestamptz not null default now()
);

create index trips_user_created_idx on public.trips (user_id, created_at desc);

-- The name shown on the leaderboard. Without one, a person appears as "Rider" plus a short code,
-- so nobody's email or Clerk name is ever shown to other riders.
create table public.profiles (
  user_id text primary key,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 24),
  updated_at timestamptz not null default now()
);

create unique index profiles_display_name_idx on public.profiles (lower(display_name));

-- People can read and remove their own trips, but only choose_trip can add one,
-- so points always come from the database and can't be typed in from a browser.
revoke all on public.trips, public.profiles from anon, authenticated;
grant select, delete on public.trips to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.trips, public.profiles to service_role;

alter table public.trips enable row level security;
alter table public.profiles enable row level security;

create policy "People can read their own trips"
  on public.trips for select to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can remove their own trips"
  on public.trips for delete to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can add their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can change their own profile"
  on public.profiles for update to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id)
  with check ((select auth.jwt()) ->> 'sub' = user_id);

create function public.miles_between(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 3958.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

revoke all on function public.miles_between(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- Records a chosen trip. It re-checks everything and works out the points itself using the same rules
-- as the page, so a leaderboard score can't be faked by changing what the browser sends. It can't tell
-- whether the ride really happened, so a 30 minute wait between trips limits how fast points can build up.
create function public.choose_trip(route_id uuid, pickup_id text, dropoff_id text, reversed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller text := (select auth.jwt()) ->> 'sub';
  chosen_route public.routes;
  latest_run public.worker_runs;
  minutes_left integer;
  from_lat double precision;
  from_lon double precision;
  to_lat double precision;
  to_lon double precision;
  pickup record;
  dropoff record;
  pickup_miles double precision;
  dropoff_miles double precision;
  pickup_score integer;
  dropoff_score integer;
  saved public.trips;
begin
  if caller is null then
    raise exception 'Sign in to choose a trip.';
  end if;

  -- Two quick clicks wait for each other here, so the second one sees the first trip.
  perform pg_advisory_xact_lock(hashtext(caller));

  select * into chosen_route from public.routes r where r.id = route_id and r.user_id = caller;
  if not found then
    raise exception 'Route not found.';
  end if;

  select * into latest_run from public.worker_runs w order by w.ran_at desc limit 1;
  if not found or not latest_run.ok or latest_run.ran_at < now() - interval '3 minutes' then
    raise exception 'Bike counts are out of date, so we can''t score a trip right now.';
  end if;

  select ceil(extract(epoch from max(t.created_at) + interval '30 minutes' - now()) / 60)::integer into minutes_left
  from public.trips t
  where t.user_id = caller and t.created_at > now() - interval '30 minutes';
  if minutes_left is not null then
    raise exception 'You can choose another trip in % min.', minutes_left;
  end if;

  if pickup_id = dropoff_id then
    raise exception 'Choose different stations for pick-up and drop-off.';
  end if;

  if reversed then
    from_lat := chosen_route.end_lat; from_lon := chosen_route.end_lon;
    to_lat := chosen_route.start_lat; to_lon := chosen_route.start_lon;
  else
    from_lat := chosen_route.start_lat; from_lon := chosen_route.start_lon;
    to_lat := chosen_route.end_lat; to_lon := chosen_route.end_lon;
  end if;

  select s.name, s.lat, s.lon, st.bikes, st.docks, st.is_renting into pickup
  from public.stations s join public.station_status st on st.station_id = s.station_id
  where s.station_id = pickup_id and btrim(s.name) !~* '^public rack';
  if not found or not pickup.is_renting or pickup.bikes < 1 then
    raise exception 'That pick-up station no longer has a bike available.';
  end if;

  select s.name, s.lat, s.lon, st.bikes, st.docks, st.is_returning into dropoff
  from public.stations s join public.station_status st on st.station_id = s.station_id
  where s.station_id = dropoff_id and btrim(s.name) !~* '^public rack';
  if not found or not dropoff.is_returning or dropoff.docks < 1 then
    raise exception 'That drop-off station no longer has an open dock.';
  end if;

  pickup_miles := public.miles_between(from_lat, from_lon, pickup.lat, pickup.lon);
  dropoff_miles := public.miles_between(to_lat, to_lon, dropoff.lat, dropoff.lon);
  if pickup_miles > 0.5 or dropoff_miles > 0.5 then
    raise exception 'Those stations aren''t within a half-mile walk of this route.';
  end if;

  pickup_score := round(10.0 * pickup.bikes / (pickup.bikes + pickup.docks));
  dropoff_score := round(10.0 * dropoff.docks / (dropoff.bikes + dropoff.docks));

  insert into public.trips (
    user_id, route_name, pickup_station_id, pickup_name, pickup_points,
    dropoff_station_id, dropoff_name, dropoff_points, points, miles
  )
  values (
    caller, chosen_route.name, pickup_id, btrim(pickup.name), pickup_score,
    dropoff_id, btrim(dropoff.name), dropoff_score, pickup_score + dropoff_score,
    round((pickup_miles + dropoff_miles)::numeric, 1)
  )
  returning * into saved;

  return jsonb_build_object('id', saved.id, 'points', saved.points);
end;
$$;

revoke all on function public.choose_trip(uuid, text, text, boolean) from public, anon;
grant execute on function public.choose_trip(uuid, text, text, boolean) to authenticated;

-- The top 10 riders, plus the person asking if they're further down. It returns totals and
-- display names only: no user ids, and nothing about anyone's routes or stations.
create function public.leaderboard()
returns table (place bigint, rider text, total_points bigint, trip_count bigint, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select t.user_id, sum(t.points)::bigint as total, count(*)::bigint as trip_total
    from public.trips t
    group by t.user_id
  ),
  ranked as (
    select totals.*, rank() over (order by totals.total desc, totals.trip_total asc) as position
    from totals
  )
  select
    r.position,
    coalesce(p.display_name, 'Rider ' || upper(right(md5(r.user_id), 4))),
    r.total,
    r.trip_total,
    r.user_id = (select auth.jwt()) ->> 'sub'
  from ranked r
  left join public.profiles p on p.user_id = r.user_id
  where r.position <= 10 or r.user_id = (select auth.jwt()) ->> 'sub'
  order by r.position, 2;
$$;

revoke all on function public.leaderboard() from public, anon;
grant execute on function public.leaderboard() to authenticated;
