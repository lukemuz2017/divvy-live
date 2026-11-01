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

// Saved locations are rounded to about a block, so anything closer still reads as 0.1 miles.
export const formatMiles = (miles: number) => `${Math.max(0.1, miles).toFixed(1)} mi`;

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

// Public racks hold only a bike or two and appear to take e-bikes only, so nearly any bike would "fill"
// or "empty" one. Counting them would crowd real docked stations out of the rankings.
export const isPublicRack = (station: Station) => /^public rack/i.test(station.name.trim());

export function stationsInRange(stations: Station[], point: Point): Station[] {
  return stations
    .filter((station) => !isPublicRack(station) && milesBetween(point, station) <= MAX_WALK_MILES)
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

function usableOptions(
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
  return options;
}

// Most points first, and the shorter walk wins a tie.
const mostPoints = (options: Recommendation[]) =>
  [...options].sort((a, b) => b.points - a.points || a.miles - b.miles).slice(0, TOP_OPTIONS);

// Shortest walk first, and more points win a tie.
const shortestWalk = (options: Recommendation[]) =>
  [...options].sort((a, b) => a.miles - b.miles || b.points - a.points).slice(0, TOP_OPTIONS);

const pickupOptions = (stations: Station[], statuses: Map<string, StationStatus>, point: Point) =>
  usableOptions(stations, statuses, point, (s) => s.is_renting && s.bikes >= 1, pickupPoints);

const dropoffOptions = (stations: Station[], statuses: Map<string, StationStatus>, point: Point) =>
  usableOptions(stations, statuses, point, (s) => s.is_returning && s.docks >= 1, dropoffPoints);

export function rankPickups(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return mostPoints(pickupOptions(stations, statuses, point));
}

export function rankDropoffs(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return mostPoints(dropoffOptions(stations, statuses, point));
}

export function closestPickups(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return shortestWalk(pickupOptions(stations, statuses, point));
}

export function closestDropoffs(stations: Station[], statuses: Map<string, StationStatus>, point: Point) {
  return shortestWalk(dropoffOptions(stations, statuses, point));
}

export type Priority = 'walk' | 'balanced' | 'points';

const MAX_POINTS = 10;

// How much points count in the recommended trip. Walking gets the rest.
const POINTS_WEIGHT: Record<Priority, number> = { walk: 0.2, balanced: 0.5, points: 0.8 };

// The internal score behind the recommended trip, from 0 to 1.
export function balanceScore(option: Recommendation, priority: Priority = 'balanced'): number {
  const pointsWeight = POINTS_WEIGHT[priority];
  return pointsWeight * (option.points / MAX_POINTS) + (1 - pointsWeight) * (1 - option.miles / MAX_WALK_MILES);
}

// A pick-up and a drop-off don't affect each other, so the best of each makes the best trip.
const bestForPriority = (options: Recommendation[], priority: Priority): Recommendation | null =>
  [...options].sort((a, b) => balanceScore(b, priority) - balanceScore(a, priority) || a.miles - b.miles)[0] ?? null;

export function recommendedPickup(
  stations: Station[],
  statuses: Map<string, StationStatus>,
  point: Point,
  priority: Priority = 'balanced',
) {
  return bestForPriority(pickupOptions(stations, statuses, point), priority);
}

export function recommendedDropoff(
  stations: Station[],
  statuses: Map<string, StationStatus>,
  point: Point,
  priority: Priority = 'balanced',
) {
  return bestForPriority(dropoffOptions(stations, statuses, point), priority);
}

// Stations in both top threes, which the page calls out as the best of both.
export function sharedStationIds(a: Recommendation[], b: Recommendation[]): Set<string> {
  const inB = new Set(b.map((option) => option.station.station_id));
  return new Set(a.map((option) => option.station.station_id).filter((id) => inB.has(id)));
}

// Realtime can deliver a change with its fields missing. Trusting one would show a false outage,
// because a run with no ok field reads as a failed run, so these decide when to reload instead.
export function isCompleteRun(row: Partial<WorkerRun> | null | undefined): row is WorkerRun {
  return typeof row?.ok === 'boolean' && typeof row?.ran_at === 'string';
}

export function isCompleteStatus(row: Partial<StationStatus> | null | undefined): row is StationStatus {
  return (
    typeof row?.station_id === 'string' &&
    typeof row?.bikes === 'number' &&
    typeof row?.ebikes === 'number' &&
    typeof row?.docks === 'number' &&
    typeof row?.is_renting === 'boolean' &&
    typeof row?.is_returning === 'boolean'
  );
}

// Uses the browser's clock, because a stopped worker sends nothing that could announce it has stopped.
export function freshnessOf(run: WorkerRun | null, loaded: boolean, nowMs: number): Freshness {
  if (!loaded) return 'loading';
  if (!run) return 'stale';
  if (!run.ok) return 'down';
  return nowMs - new Date(run.ran_at).getTime() > STALE_AFTER_MS ? 'stale' : 'fresh';
}
