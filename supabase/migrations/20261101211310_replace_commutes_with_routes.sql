-- People can save several named routes and activate one at a time.
-- commutes has never held real data, so it is replaced rather than altered.
drop table public.commutes;

-- numeric(6,3) makes the database itself round coordinates to three decimals, about a block,
-- so exact locations can't be stored. user_id is the Clerk user id, from the sign-in token.
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  is_active boolean not null default false,
  start_lat numeric(6, 3) not null check (start_lat between -90 and 90),
  start_lon numeric(6, 3) not null check (start_lon between -180 and 180),
  end_lat numeric(6, 3) not null check (end_lat between -90 and 90),
  end_lon numeric(6, 3) not null check (end_lon between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person can't reuse a route name, and can have at most one active route.
create unique index routes_user_name_idx on public.routes (user_id, lower(name));
create unique index routes_one_active_per_user_idx on public.routes (user_id) where is_active;

revoke all on public.routes from anon, authenticated;
grant select, insert, update, delete on public.routes to authenticated;
grant all on public.routes to service_role;

alter table public.routes enable row level security;

create policy "People can read their own routes"
  on public.routes for select to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can add their own routes"
  on public.routes for insert to authenticated
  with check ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can change their own routes"
  on public.routes for update to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id)
  with check ((select auth.jwt()) ->> 'sub' = user_id);

create policy "People can delete their own routes"
  on public.routes for delete to authenticated
  using ((select auth.jwt()) ->> 'sub' = user_id);

-- Switches the active route in one transaction. It runs as the caller,
-- so row-level security limits it to that person's own routes.
create function public.set_active_route(route_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.routes where id = route_id) then
    raise exception 'Route not found';
  end if;

  update public.routes set is_active = false, updated_at = now() where is_active and id <> route_id;
  update public.routes set is_active = true, updated_at = now() where id = route_id;
end;
$$;

revoke all on function public.set_active_route(uuid) from public, anon;
grant execute on function public.set_active_route(uuid) to authenticated;
