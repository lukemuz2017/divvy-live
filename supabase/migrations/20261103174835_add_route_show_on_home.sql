-- Which routes appear as buttons on the Home page. A person can show up to 3; the rest stay on Saved routes.
alter table public.routes add column on_dashboard boolean not null default false;

-- Existing routes start on Home, up to 3 per person, oldest first.
update public.routes r set on_dashboard = true
from (select id, row_number() over (partition by user_id order by created_at) as position from public.routes) ranked
where ranked.id = r.id and ranked.position <= 3;

-- Enforced here so a page bug can't put a fourth route on Home. It runs as the caller,
-- so row-level security already limits the count to that person's own routes.
create function public.limit_routes_on_dashboard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.on_dashboard and (
    select count(*) from public.routes r
    where r.user_id = new.user_id and r.on_dashboard and r.id <> new.id
  ) >= 3 then
    raise exception 'You can show up to 3 routes on Home. Remove one from Home first.';
  end if;
  return new;
end;
$$;

create trigger routes_limit_on_dashboard
  before insert or update of on_dashboard on public.routes
  for each row execute function public.limit_routes_on_dashboard();
