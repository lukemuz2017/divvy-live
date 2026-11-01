-- Station details from Divvy's station_information feed. These rarely change.
create table public.stations (
  station_id text primary key,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  capacity integer not null check (capacity >= 0),
  updated_at timestamptz not null default now()
);

-- Live counts from Divvy's station_status feed. The worker writes a row only when
-- a value here changes, and updated_at is the last time that happened.
create table public.station_status (
  station_id text primary key references public.stations (station_id) on delete cascade,
  bikes integer not null check (bikes >= 0),
  ebikes integer not null check (ebikes >= 0),
  docks integer not null check (docks >= 0),
  is_renting boolean not null,
  is_returning boolean not null,
  last_reported timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per worker run, including failed runs. The page's stale and down states read this.
create table public.worker_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  rows_changed integer not null default 0 check (rows_changed >= 0),
  stations_seen integer,
  feed_updated_at timestamptz,
  duration_ms integer,
  error text
);

create index worker_runs_ran_at_idx on public.worker_runs (ran_at desc);

-- One saved commute per person. numeric(6,3) makes the database itself round coordinates
-- to three decimals, about a block, so exact home and work locations can't be stored.
-- user_id is the Clerk user id, taken from the sign-in token.
create table public.commutes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique default (auth.jwt() ->> 'sub'),
  home_lat numeric(6, 3) not null check (home_lat between -90 and 90),
  home_lon numeric(6, 3) not null check (home_lon between -180 and 180),
  work_lat numeric(6, 3) not null check (work_lat between -90 and 90),
  work_lon numeric(6, 3) not null check (work_lon between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Read and write access. The anon role gets nothing, because every page requires sign-in.
revoke all on public.stations, public.station_status, public.worker_runs, public.commutes from anon, authenticated;

grant select on public.stations, public.station_status, public.worker_runs to authenticated;
grant select, insert, update, delete on public.commutes to authenticated;

grant all on public.stations, public.station_status, public.worker_runs, public.commutes to service_role;

-- Row-level security. The worker uses the secret key, which bypasses these policies.
alter table public.stations enable row level security;
alter table public.station_status enable row level security;
alter table public.worker_runs enable row level security;
alter table public.commutes enable row level security;

create policy "Signed-in people can read stations"
  on public.stations for select to authenticated using (true);

create policy "Signed-in people can read station status"
  on public.station_status for select to authenticated using (true);

create policy "Signed-in people can read worker runs"
  on public.worker_runs for select to authenticated using (true);

create policy "People can read their own commute"
  on public.commutes for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "People can add their own commute"
  on public.commutes for insert to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "People can change their own commute"
  on public.commutes for update to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "People can delete their own commute"
  on public.commutes for delete to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

-- Realtime pushes changes from these two tables to open pages.
-- stations and commutes stay out: one rarely changes and the other is private.
alter publication supabase_realtime add table public.station_status, public.worker_runs;
