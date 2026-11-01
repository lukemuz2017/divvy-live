-- pg_cron runs jobs on a schedule, and pg_net lets those jobs make HTTP calls.
create extension if not exists pg_cron;
create extension if not exists pg_net;
