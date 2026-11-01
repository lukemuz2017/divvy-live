// Runs the worker's logic on a saved copy of Divvy's response, with a fake database, so it touches nothing live.
// Run with: node --test supabase/tests/divvy-worker.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  parseStations,
  parseStatuses,
  runWorker,
  STATION_INFORMATION_URL,
  STATION_STATUS_URL,
} from '../functions/divvy-worker/worker.ts';
import type { RunRecord, StationRow, StatusRow, SyncResult } from '../functions/divvy-worker/worker.ts';

const loadFixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

// The worker is run moments after the saved copy was taken, so the feed counts as current.
function setup(options: {
  status?: unknown;
  information?: unknown;
  fetchError?: Error;
  syncError?: Error;
  nowSeconds?: number;
} = {}) {
  const status = options.status ?? loadFixture('station_status.sample.json');
  const information = options.information ?? loadFixture('station_information.sample.json');
  const saved: { stations: StationRow[]; statuses: StatusRow[] }[] = [];
  const runs: RunRecord[] = [];
  const nowSeconds = options.nowSeconds ?? loadFixture('station_status.sample.json').last_updated + 5;

  const deps = {
    fetchJson: async (url: string) => {
      if (options.fetchError) throw options.fetchError;
      if (url === STATION_STATUS_URL) return status;
      if (url === STATION_INFORMATION_URL) return information;
      throw new Error(`Unexpected URL: ${url}`);
    },
    sync: async (stations: StationRow[], statuses: StatusRow[]): Promise<SyncResult> => {
      if (options.syncError) throw options.syncError;
      saved.push({ stations, statuses });
      return { stations_changed: 1, stations_removed: 1, statuses_changed: 3 };
    },
    recordRun: async (run: RunRecord) => {
      runs.push(run);
    },
    now: () => nowSeconds * 1000,
    log: () => {},
  };
  return { deps, saved, runs };
}

test('turns a saved status response into the rows the worker saves', () => {
  const feed = loadFixture('station_status.sample.json');
  const rows = parseStatuses(feed);
  const raw = feed.data.stations[0];

  assert.equal(rows.length, feed.data.stations.length);
  assert.deepEqual(rows[0], {
    station_id: raw.station_id,
    bikes: raw.num_bikes_available,
    ebikes: raw.num_ebikes_available,
    docks: raw.num_docks_available,
    is_renting: raw.is_renting === 1,
    is_returning: raw.is_returning === 1,
    last_reported: new Date(raw.last_reported * 1000).toISOString(),
  });
});

test('turns a saved station response into rows and trims stray spaces from names', () => {
  const feed = loadFixture('station_information.sample.json');
  feed.data.stations[0].name = 'Broadway & Glenlake Ave  ';
  const rows = parseStations(feed);
  const raw = feed.data.stations[0];

  assert.equal(rows.length, feed.data.stations.length);
  assert.deepEqual(rows[0], {
    station_id: raw.station_id,
    name: 'Broadway & Glenlake Ave',
    lat: raw.lat,
    lon: raw.lon,
    capacity: raw.capacity,
  });
});

test('a good run saves every parsed row and records the run', async () => {
  const { deps, saved, runs } = setup();
  const statusFeed = loadFixture('station_status.sample.json');
  await runWorker(deps);

  assert.equal(saved.length, 1);
  assert.equal(saved[0].statuses.length, statusFeed.data.stations.length);
  assert.equal(saved[0].stations.length, loadFixture('station_information.sample.json').data.stations.length);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ok, true);
  assert.equal(runs[0].rows_changed, 5, 'adds up station changes, removals and status changes');
  assert.equal(runs[0].stations_seen, statusFeed.data.stations.length);
  assert.equal(runs[0].feed_updated_at, new Date(statusFeed.last_updated * 1000).toISOString());
  assert.equal(runs[0].error, null);
});

test('if Divvy is unreachable, it saves nothing and records a failed run', async () => {
  const { deps, saved, runs } = setup({ fetchError: new Error('station_status returned HTTP 503') });
  await runWorker(deps);

  assert.equal(saved.length, 0);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].ok, false);
  assert.equal(runs[0].error, 'station_status returned HTTP 503');
});

test('if Divvy renames a field, it saves nothing instead of saving blanks', async () => {
  const status = loadFixture('station_status.sample.json');
  status.data.stations[2].docks_available = status.data.stations[2].num_docks_available;
  delete status.data.stations[2].num_docks_available;
  const { deps, saved, runs } = setup({ status });
  await runWorker(deps);

  assert.equal(saved.length, 0);
  assert.equal(runs[0].ok, false);
  assert.match(runs[0].error ?? '', /num_docks_available/);
});

test('if a count is impossible, it saves nothing', async () => {
  const status = loadFixture('station_status.sample.json');
  status.data.stations[0].num_bikes_available = -1;
  const { deps, saved, runs } = setup({ status });
  await runWorker(deps);

  assert.equal(saved.length, 0);
  assert.equal(runs[0].ok, false);
  assert.match(runs[0].error ?? '', /num_bikes_available/);
});

test('if the feed comes back empty, it saves nothing', async () => {
  const status = loadFixture('station_status.sample.json');
  status.data.stations = [];
  const { deps, saved, runs } = setup({ status });
  await runWorker(deps);

  assert.equal(saved.length, 0);
  assert.equal(runs[0].ok, false);
  assert.match(runs[0].error ?? '', /no stations/);
});

test('if the feed has stopped updating, it saves nothing and the page will show down', async () => {
  const lastUpdated = loadFixture('station_status.sample.json').last_updated;
  const { deps, saved, runs } = setup({ nowSeconds: lastUpdated + 11 * 60 });
  await runWorker(deps);

  assert.equal(saved.length, 0);
  assert.equal(runs[0].ok, false);
  assert.match(runs[0].error ?? '', /11 minutes old/);
});

test('if the database save fails, the run is recorded as failed', async () => {
  const { deps, runs } = setup({ syncError: new Error('database unavailable') });
  await runWorker(deps);

  assert.equal(runs[0].ok, false);
  assert.equal(runs[0].rows_changed, 0);
  assert.equal(runs[0].error, 'database unavailable');
});
