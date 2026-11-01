-- Run the worker every minute, because Divvy's feed refreshes every 60 seconds.
-- The token is read from Vault at call time, so it isn't stored in the job.
select cron.schedule(
  'divvy-worker-every-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://lcfvojxisfzinywezofl.supabase.co/functions/v1/divvy-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- Both logs grow by a row a minute and nothing cleans them up by default,
-- so trim them daily to stay well inside the free plan's database size.
select cron.schedule(
  'trim-worker-logs-daily',
  '17 3 * * *',
  $job$
  delete from public.worker_runs where ran_at < now() - interval '14 days';
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  $job$
);
