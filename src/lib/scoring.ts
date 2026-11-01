// The recommendation rules, with no framework imports so tests can run them directly.

export const MAX_WALK_MILES = 0.5;
export const STALE_AFTER_MS = 3 * 60 * 1000;
const WALK_MINUTES_PER_MILE = 20;
const EARTH_RADIUS_MILES = 3958.8;
const MILES_PER_DEGREE_LAT = 69;
const TOP_OPTIONS = 3;

export type Point = { lat: number; lon: number };

export type Station = Point & {
  station_id: string;
  name: string;
  capacity: number;
};

export type StationStatus = {
  station_id: string;
  bikes: number;
  ebikes: number;
  docks: number;
  is_renting: boolean;
  is_returning: boolean;
  updated_at: string;
};

export type WorkerRun = {
  id: number;
  ran_at: string;
  ok: boolean;
  rows_changed: number;
  error: string | null;
};

export type Freshness = 'loading' | 'fresh' | 'stale' | 'down';

export type Recommendation = {
  station: Station;
  status: StationStatus;
  points: number;
  miles: number;
  walkMinutes: number;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function milesBetween(a: Point, b: Point): number {
  const latDelta = toRadians(b.lat - a.lat);
  const lonDelta = toRadians(b.lon - a.lon);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// A box around a point, so the database only returns stations close enough to be worth measuring.
export function boundsAround(point: Point) {
  const latRange = MAX_WALK_MILES / MILES_PER_DEGREE_LAT;
  const lonRange = latRange / Math.cos(toRadians(point.lat));
  return {
    minLat: point.lat - latRange,
    maxLat: point.lat + latRange,
    minLon: point.lon - lonRange,
    maxLon: point.lon + lonRange,
  };
}

export function stationsInRange(stations: Station[], point: Point): Station[] {
  return stations
    .filter((station) => milesBetween(point, station) <= MAX_WALK_MILES)
    .sort((a, b) => milesBetween(point, a) - milesBetween(point, b));
}

// Divide by bikes + docks, not capacity: broken docks make capacity misleading.
export function pickupPoints(status: StationStatus): number {
  const usable = status.bikes + status.docks;
  return usable === 0 ? 0 : Math.round((10 * status.bikes) / usable);
}

export function dropoffPoints(status: StationStatus): number {
  const usable = status.bikes + status.docks;
  return usable === 0 ? 0 : Math.round((10 * status.docks) / usable);
}

function rank(
  stations: Station[],
  statuses: Map<string, StationStatus>,
  point: Point,
  isUsable: (status: StationStatus) => boolean,
  score: (status: StationStatus) => number,
): Recommendation[] {
  const options: Recommendation[] = [];
  for (const station of stationsInRange(stations, point)) {
    const status = statuses.get(station.station_id);
    if (!status || !isUsable(status)) continue;
    const miles = milesBetween(point, station);
    options.push({
      station,
      status,
      points: score(status),
      miles,
      walkMinutes: Math.max(1, Math.round(miles * WALK_MINUTES_PER_MILE)),
    });
  }
  // Most points first, and the shorter walk wins a tie.
  return options.sort((a, b) => b.points - a.points || a.miles - b.miles).slice(0, TOP_OPTIONS);
}

export function rankPickups(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return rank(stations, statuses, point, (s) => s.is_renting && s.bikes >= 1, pickupPoints);
}

export function rankDropoffs(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return rank(stations, statuses, point, (s) => s.is_returning && s.docks >= 1, dropoffPoints);
}

// Uses the browser's clock, because a stopped worker sends nothing that could announce it has stopped.
export function freshnessOf(run: WorkerRun | null, loaded: boolean, nowMs: number): Freshness {
  if (!loaded) return 'loading';
  if (!run) return 'stale';
  if (!run.ok) return 'down';
  return nowMs - new Date(run.ran_at).getTime() > STALE_AFTER_MS ? 'stale' : 'fresh';
}
