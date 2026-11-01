// The worker's logic, with no Supabase or Deno imports, so tests can run it on a saved copy of the feed.

const FEED_BASE = 'https://gbfs.lyft.com/gbfs/2.3/chi/en';
export const STATION_INFORMATION_URL = `${FEED_BASE}/station_information.json`;
export const STATION_STATUS_URL = `${FEED_BASE}/station_status.json`;

// Divvy says the feed refreshes every 60 seconds. Well past that, it has stopped updating,
// and saving it as if it were current would make the page look fresh when it isn't.
const MAX_FEED_AGE_MS = 10 * 60 * 1000;

export type StationRow = {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
};

export type StatusRow = {
  station_id: string;
  bikes: number;
  ebikes: number;
  docks: number;
  is_renting: boolean;
  is_returning: boolean;
  last_reported: string | null;
};

export type SyncResult = {
  stations_changed: number;
  stations_removed: number;
  statuses_changed: number;
};

export type RunRecord = {
  ok: boolean;
  rows_changed: number;
  stations_seen: number | null;
  feed_updated_at: string | null;
  duration_ms: number;
  error: string | null;
};

export type WorkerDeps = {
  fetchJson: (url: string) => Promise<unknown>;
  sync: (stations: StationRow[], statuses: StatusRow[]) => Promise<SyncResult>;
  recordRun: (run: RunRecord) => Promise<void>;
  now: () => number;
  log: (message: string) => void;
};

type Station = Record<string, unknown>;

function readStations(feed: unknown, feedName: string): Station[] {
  const stations = (feed as { data?: { stations?: unknown } } | null)?.data?.stations;
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error(`${feedName} has no stations`);
  }
  return stations as Station[];
}

function readString(station: Station, field: string): string {
  const value = station[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Station ${String(station.station_id)} has a bad ${field}: ${JSON.stringify(value)}`);
  }
  return value.trim();
}

function readNumber(station: Station, field: string): number {
  const value = station[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Station ${String(station.station_id)} has a bad ${field}: ${JSON.stringify(value)}`);
  }
  return value;
}

function readCount(station: Station, field: string): number {
  const value = readNumber(station, field);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Station ${String(station.station_id)} has a bad ${field}: ${value}`);
  }
  return value;
}

// Divvy sends these flags as 0 or 1, while the GBFS standard allows true or false.
function readFlag(station: Station, field: string): boolean {
  const value = station[field];
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  throw new Error(`Station ${String(station.station_id)} has a bad ${field}: ${JSON.stringify(value)}`);
}

export function parseStations(feed: unknown): StationRow[] {
  return readStations(feed, 'station_information').map((station) => ({
    station_id: readString(station, 'station_id'),
    name: readString(station, 'name'),
    lat: readNumber(station, 'lat'),
    lon: readNumber(station, 'lon'),
    capacity: readCount(station, 'capacity'),
  }));
}

export function parseStatuses(feed: unknown): StatusRow[] {
  return readStations(feed, 'station_status').map((station) => ({
    station_id: readString(station, 'station_id'),
    bikes: readCount(station, 'num_bikes_available'),
    ebikes: readCount(station, 'num_ebikes_available'),
    docks: readCount(station, 'num_docks_available'),
    is_renting: readFlag(station, 'is_renting'),
    is_returning: readFlag(station, 'is_returning'),
    last_reported: typeof station.last_reported === 'number'
      ? new Date(station.last_reported * 1000).toISOString()
      : null,
  }));
}

export function readFeedTime(feed: unknown): number {
  const lastUpdated = (feed as { last_updated?: unknown } | null)?.last_updated;
  if (typeof lastUpdated !== 'number') {
    throw new Error(`station_status has a bad last_updated: ${JSON.stringify(lastUpdated)}`);
  }
  return lastUpdated * 1000;
}

// One full run. Any failure before the save means nothing is saved, and the run is still recorded,
// which is how the page knows to show its down state.
export async function runWorker(deps: WorkerDeps): Promise<RunRecord> {
  const startedAt = deps.now();
  let stationsSeen: number | null = null;
  let feedUpdatedAt: string | null = null;
  let run: RunRecord;

  try {
    const [informationFeed, statusFeed] = await Promise.all([
      deps.fetchJson(STATION_INFORMATION_URL),
      deps.fetchJson(STATION_STATUS_URL),
    ]);

    const stations = parseStations(informationFeed);
    const statuses = parseStatuses(statusFeed);
    const feedTime = readFeedTime(statusFeed);
    stationsSeen = statuses.length;
    feedUpdatedAt = new Date(feedTime).toISOString();
    deps.log(`Fetched ${stations.length} stations and ${statuses.length} statuses, feed updated ${feedUpdatedAt}`);

    const feedAgeMs = startedAt - feedTime;
    if (feedAgeMs > MAX_FEED_AGE_MS) {
      throw new Error(`Feed is ${Math.round(feedAgeMs / 60000)} minutes old`);
    }

    const result = await deps.sync(stations, statuses);
    const rowsChanged = result.stations_changed + result.stations_removed + result.statuses_changed;
    deps.log(
      `Saved ${result.statuses_changed} status changes, ${result.stations_changed} station changes, ${result.stations_removed} stations removed`,
    );

    run = {
      ok: true,
      rows_changed: rowsChanged,
      stations_seen: stationsSeen,
      feed_updated_at: feedUpdatedAt,
      duration_ms: deps.now() - startedAt,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`Run failed: ${message}`);
    run = {
      ok: false,
      rows_changed: 0,
      stations_seen: stationsSeen,
      feed_updated_at: feedUpdatedAt,
      duration_ms: deps.now() - startedAt,
      error: message.slice(0, 500),
    };
  }

  await deps.recordRun(run);
  return run;
}
