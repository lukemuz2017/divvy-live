-- What the recommended trip should favor, saved separately for each direction of a route.
alter table public.routes
  add column forward_priority text not null default 'balanced' check (forward_priority in ('walk', 'balanced', 'points')),
  add column reverse_priority text not null default 'balanced' check (reverse_priority in ('walk', 'balanced', 'points'));
