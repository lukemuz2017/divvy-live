// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  balanceScore,
  boundsAround,
  closestDropoffs,
  closestPickups,
  dropoffPoints,
  formatMiles,
  freshnessOf,
  isCompleteRun,
  isCompleteStatus,
  milesBetween,
  pickupPoints,
  rankDropoffs,
  rankPickups,
  recommendedDropoff,
  recommendedPickup,
  sharedStationIds,
  STALE_AFTER_MS,
} from './scoring.ts';
import type { Station, StationStatus, WorkerRun } from './scoring.ts';

const home = { lat: 41.88, lon: -87.63 };

const station = (id: string, latOffset: number): Station => ({
  station_id: id,
  name: id,
  lat: home.lat + latOffset,
  lon: home.lon,
  capacity: 15,
});

const status = (id: string, bikes: number, docks: number, changes: Partial<StationStatus> = {}): StationStatus => ({
  station_id: id,
  bikes,
  ebikes: 0,
  docks,
  is_renting: true,
  is_returning: true,
  updated_at: '2026-11-01T12:00:00Z',
  ...changes,
});

const statusMap = (...rows: StationStatus[]) => new Map(rows.map((row) => [row.station_id, row]));

test('a full station earns the most pick-up points and the fewest drop-off points', () => {
  assert.equal(pickupPoints(status('a', 12, 0)), 10);
  assert.equal(dropoffPoints(status('a', 12, 0)), 0);
  assert.equal(pickupPoints(status('a', 3, 9)), 3);
  assert.equal(dropoffPoints(status('a', 3, 9)), 8);
});

test('a station with no usable bikes or docks earns nothing instead of dividing by zero', () => {
  assert.equal(pickupPoints(status('a', 0, 0)), 0);
  assert.equal(dropoffPoints(status('a', 0, 0)), 0);
});

test('pick-ups rank the fullest station first, within walking distance only', () => {
  const stations = [station('near-half', 0.001), station('near-full', 0.002), station('too-far', 0.01)];
  const ranked = rankPickups(stations, statusMap(status('near-half', 5, 5), status('near-full', 9, 1), status('too-far', 10, 0)), home);

  assert.deepEqual(ranked.map((option) => option.station.station_id), ['near-full', 'near-half']);
  assert.equal(ranked[0].points, 9);
});

test('drop-offs rank the emptiest station first', () => {
  const stations = [station('half', 0.001), station('empty', 0.002)];
  const ranked = rankDropoffs(stations, statusMap(status('half', 5, 5), status('empty', 1, 9)), home);

  assert.equal(ranked[0].station.station_id, 'empty');
  assert.equal(ranked[0].points, 9);
});

test('a tie goes to the shorter walk', () => {
  const stations = [station('far', 0.005), station('near', 0.001)];
  const ranked = rankPickups(stations, statusMap(status('far', 8, 2), status('near', 8, 2)), home);

  assert.equal(ranked[0].station.station_id, 'near');
});

test('stations you cannot use are left out', () => {
  const stations = [station('empty', 0.001), station('closed', 0.002), station('full', 0.003), station('no-returns', 0.004)];
  const statuses = statusMap(
    status('empty', 0, 10),
    status('closed', 8, 2, { is_renting: false }),
    status('full', 10, 0),
    status('no-returns', 2, 8, { is_returning: false }),
  );

  assert.deepEqual(rankPickups(stations, statuses, home).map((o) => o.station.station_id), ['full', 'no-returns']);
  assert.deepEqual(rankDropoffs(stations, statuses, home).map((o) => o.station.station_id), ['empty', 'closed']);
});

test('the shortest walk section ranks by distance, even when a farther station earns more points', () => {
  const stations = [station('far-full', 0.005), station('near-half', 0.001)];
  const statuses = statusMap(status('far-full', 10, 0), status('near-half', 5, 5));

  assert.equal(closestPickups(stations, statuses, home)[0].station.station_id, 'near-half');
  assert.equal(rankPickups(stations, statuses, home)[0].station.station_id, 'far-full');
});

test('the shortest walk section leaves out stations you cannot use', () => {
  const stations = [station('near-empty', 0.001), station('near-full', 0.002), station('farther', 0.003)];
  const statuses = statusMap(status('near-empty', 0, 10), status('near-full', 10, 0), status('farther', 5, 5));

  assert.deepEqual(closestPickups(stations, statuses, home).map((o) => o.station.station_id), ['near-full', 'farther']);
  assert.deepEqual(closestDropoffs(stations, statuses, home).map((o) => o.station.station_id), ['near-empty', 'farther']);
});

test('public racks are left out of every recommendation', () => {
  const rack = { ...station('rack', 0.001), name: 'Public Rack - Wacker Dr & Madison St (East)' };
  const dock = station('dock', 0.002);
  const statuses = statusMap(status('rack', 0, 4), status('dock', 5, 5));

  assert.deepEqual(rankDropoffs([rack, dock], statuses, home).map((o) => o.station.station_id), ['dock']);
  assert.deepEqual(closestDropoffs([rack, dock], statuses, home).map((o) => o.station.station_id), ['dock']);
  assert.deepEqual(rankPickups([rack, dock], statuses, home).map((o) => o.station.station_id), ['dock']);
});

test('distances read in tenths of a mile, and never as zero', () => {
  assert.equal(formatMiles(0.42), '0.4 mi');
  assert.equal(formatMiles(0.01), '0.1 mi');
  assert.equal(formatMiles(1.26), '1.3 mi');
});

const option = (points: number, miles: number) => ({
  station: station('a', 0),
  status: status('a', 1, 1),
  points,
  miles,
  walkMinutes: 1,
});

test('the balance score weighs points and walking equally', () => {
  assert.equal(balanceScore(option(10, 0)), 1, 'most points with no walk is a perfect score');
  assert.equal(balanceScore(option(0, 0.5)), 0, 'no points at the walking limit is the lowest score');
  assert.equal(balanceScore(option(10, 0.5)), 0.5);
  assert.equal(balanceScore(option(0, 0)), 0.5);
});

test('the recommended pick-up can beat both the closest and the fullest station', () => {
  const stations = [station('closest-empty', 0.0005), station('middle', 0.002), station('fullest-far', 0.007)];
  const statuses = statusMap(status('closest-empty', 1, 9), status('middle', 8, 2), status('fullest-far', 10, 0));

  assert.equal(recommendedPickup(stations, statuses, home)?.station.station_id, 'middle');
  assert.equal(closestPickups(stations, statuses, home)[0].station.station_id, 'closest-empty');
  assert.equal(rankPickups(stations, statuses, home)[0].station.station_id, 'fullest-far');
});

test('the recommended drop-off follows the same rule, using open docks', () => {
  const stations = [station('closest-full', 0.0005), station('middle', 0.002), station('emptiest-far', 0.007)];
  const statuses = statusMap(status('closest-full', 9, 1), status('middle', 2, 8), status('emptiest-far', 0, 10));

  assert.equal(recommendedDropoff(stations, statuses, home)?.station.station_id, 'middle');
});

test('the recommendation can come from outside both top threes', () => {
  const stations = [
    station('near-1', 0.0002),
    station('near-2', 0.0003),
    station('near-3', 0.0004),
    station('balanced', 0.0015),
    station('full-1', 0.0065),
    station('full-2', 0.0066),
    station('full-3', 0.0067),
  ];
  const statuses = statusMap(
    status('near-1', 1, 9),
    status('near-2', 1, 9),
    status('near-3', 1, 9),
    status('balanced', 8, 2),
    status('full-1', 10, 0),
    status('full-2', 10, 0),
    status('full-3', 10, 0),
  );

  assert.equal(recommendedPickup(stations, statuses, home)?.station.station_id, 'balanced');
  assert.ok(!closestPickups(stations, statuses, home).some((o) => o.station.station_id === 'balanced'));
  assert.ok(!rankPickups(stations, statuses, home).some((o) => o.station.station_id === 'balanced'));
});

test('there is no recommendation when no station can be used', () => {
  const stations = [station('closed', 0.001)];
  const statuses = statusMap(status('closed', 5, 5, { is_renting: false, is_returning: false }));

  assert.equal(recommendedPickup(stations, statuses, home), null);
  assert.equal(recommendedDropoff(stations, statuses, home), null);
});

test('best of both finds stations in both top threes', () => {
  const stations = [station('close-and-full', 0.001), station('close-only', 0.002), station('full-only', 0.005)];
  const statuses = statusMap(status('close-and-full', 9, 1), status('close-only', 1, 9), status('full-only', 10, 0));
  const shared = sharedStationIds(rankPickups(stations.slice(0, 1).concat(stations[2]), statuses, home), closestPickups(stations.slice(0, 2), statuses, home));

  assert.deepEqual([...shared], ['close-and-full']);
});

test('a Realtime message with missing fields is not trusted', () => {
  assert.equal(isCompleteRun({}), false, 'an empty run must not read as a failed run');
  assert.equal(isCompleteRun({ ok: true }), false);
  assert.equal(isCompleteRun(run(1000)), true);
  assert.equal(isCompleteRun(run(1000, false)), true, 'a real failed run is still believed');

  assert.equal(isCompleteStatus({}), false);
  assert.equal(isCompleteStatus({ station_id: 'a', bikes: 1 }), false);
  assert.equal(isCompleteStatus(status('a', 1, 1)), true);
});

test('only the top three options are shown', () => {
  const stations = ['a', 'b', 'c', 'd'].map((id, index) => station(id, 0.001 * (index + 1)));
  const statuses = statusMap(status('a', 9, 1), status('b', 8, 2), status('c', 7, 3), status('d', 6, 4));

  assert.equal(rankPickups(stations, statuses, home).length, 3);
});

test('the search box contains every point within the walking limit', () => {
  const bounds = boundsAround(home);
  const edges = [
    { lat: bounds.maxLat, lon: home.lon },
    { lat: home.lat, lon: bounds.maxLon },
  ];
  for (const edge of edges) {
    assert.ok(milesBetween(home, edge) >= 0.49, 'the box should reach about half a mile');
  }
});

const run = (ageMs: number, ok = true): WorkerRun => ({
  id: 1,
  ran_at: new Date(1_000_000_000 - ageMs).toISOString(),
  ok,
  rows_changed: 3,
  error: ok ? null : 'Divvy returned HTTP 503',
});

test('freshness moves through its states', () => {
  const now = 1_000_000_000;
  assert.equal(freshnessOf(null, false, now), 'loading');
  assert.equal(freshnessOf(run(30_000), true, now), 'fresh');
  assert.equal(freshnessOf(run(STALE_AFTER_MS), true, now), 'fresh');
  assert.equal(freshnessOf(run(STALE_AFTER_MS + 1), true, now), 'stale');
  assert.equal(freshnessOf(run(30_000, false), true, now), 'down');
  assert.equal(freshnessOf(null, true, now), 'stale');
});
