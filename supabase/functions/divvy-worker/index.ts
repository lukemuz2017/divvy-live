// Connects the worker's logic to Supabase. Supabase Cron calls this every minute.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { runWorker } from './worker.ts';
import type { RunRecord, StationRow, StatusRow, SyncResult } from './worker.ts';

const FETCH_TIMEOUT_MS = 15_000;

// Supabase provides the secret key on its own servers, so it never appears in the code.
const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!).default;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, {
  auth: { persistSession: false },
});

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function sync(stations: StationRow[], statuses: StatusRow[]): Promise<SyncResult> {
  const { data, error } = await supabase.rpc('sync_divvy', { stations_in: stations, statuses_in: statuses });
  if (error) throw new Error(`Save failed: ${error.message}`);
  return data as SyncResult;
}

async function recordRun(run: RunRecord): Promise<void> {
  const { error } = await supabase.from('worker_runs').insert(run);
  if (error) throw new Error(`Recording the run failed: ${error.message}`);
}

Deno.serve(async (request) => {
  // The URL is public, so only callers holding the token in Vault can start a run.
  const token = request.headers.get('x-worker-token');
  const { data: tokenIsValid, error: tokenError } = token
    ? await supabase.rpc('worker_token_is_valid', { token })
    : { data: false, error: null };
  if (tokenError) {
    console.error(`Token check failed: ${tokenError.message}`);
    return Response.json({ error: 'Token check failed' }, { status: 500 });
  }
  if (!tokenIsValid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await runWorker({ fetchJson, sync, recordRun, now: Date.now, log: console.log });
    return Response.json(run, { status: run.ok ? 200 : 502 });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return Response.json({ error: 'Could not record the run' }, { status: 500 });
  }
});
