-- Keep the extension out of the public schema. Its functions stay in the net schema, so the Cron job is unaffected.
drop extension pg_net;
create extension pg_net schema extensions;
