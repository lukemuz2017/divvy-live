'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { routeEnds, useLatestRun, useNearbyStations, useNow, useSupabase } from '@/lib/live-data';
import type { Route } from '@/lib/live-data';
import {
  closestDropoffs,
  closestPickups,
  freshnessOf,
  MAX_WALK_MILES,
  rankDropoffs,
  rankPickups,
  recommendedDropoff,
  recommendedPickup,
  sharedStationIds,
  stationsInRange,
} from '@/lib/scoring';
import type { Priority, Recommendation } from '@/lib/scoring';
import { FreshnessBadge, FreshnessBanner, timeAgo } from './FreshnessBadge';
import { RouteForm, RouteFormDialog } from './RouteForm';
import { SiteHeader } from './SiteHeader';
import { RecommendedTrip, TripPlan } from './TripPlan';


type TripNotice = { kind: 'saved'; tripId: string; points: number } | { kind: 'error'; message: string } | { kind: 'removed' };

function LoadingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-label="Loading stations" role="status">
      {[0, 1].map((column) => (
        <div key={column} className="grid gap-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="live-pulse h-24 rounded-lg border border-line bg-surface" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { isLoaded } = useAuth();

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-5 md:py-8">
      {isLoaded ? <LiveDashboard /> : <LoadingCards />}
      <footer className="text-sm text-muted">
        A class project using Divvy’s public data. Not affiliated with Divvy or Lyft. Points are this app’s own estimate,
        not Bike Angels points. Walk times are straight-line estimates.
      </footer>
    </div>
  );
}

function LiveDashboard() {
  const supabase = useSupabase();
  const now = useNow(1000);
  const { run, loaded: runLoaded } = useLatestRun(supabase);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [routesFailed, setRoutesFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [tripNotice, setTripNotice] = useState<TripNotice | null>(null);
  const [listView, setListView] = useState<'walk' | 'points'>('walk');

  const activeRoute = routes.find((route) => route.is_active) ?? null;
  const nearby = useNearbyStations(supabase, activeRoute);
  const freshness = freshnessOf(run, runLoaded, now);

  const loadRoutes = async () => {
    const { data, error } = await supabase.from('routes').select('*').order('created_at');
    setRoutesFailed(Boolean(error));
    if (!error) setRoutes(data as Route[]);
    setRoutesLoaded(true);
  };

  useEffect(() => {
    void loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const activate = async (routeId: string) => {
    setReversed(false);
    setConfirmingDelete(false);
    setTripNotice(null);
    setRoutes((previous) => previous.map((route) => ({ ...route, is_active: route.id === routeId })));
    const { error } = await supabase.rpc('set_active_route', { route_id: routeId });
    if (error) await loadRoutes();
  };

  const onSaved = async (route: Route) => {
    setAdding(false);
    setRoutes((previous) => [...previous, route]);
    await activate(route.id);
  };

  // The database works out the points, so what's saved can differ slightly if a bike just moved.
  const chooseTrip = async (pickup: Recommendation, dropoff: Recommendation) => {
    if (!activeRoute) return;
    setChoosing(true);
    setTripNotice(null);
    const { data, error } = await supabase.rpc('choose_trip', {
      route_id: activeRoute.id,
      pickup_id: pickup.station.station_id,
      dropoff_id: dropoff.station.station_id,
      reversed,
    });
    setChoosing(false);
    if (error) setTripNotice({ kind: 'error', message: error.message });
    else setTripNotice({ kind: 'saved', tripId: data.id, points: data.points });
  };

  const undoTrip = async (tripId: string) => {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    setTripNotice(error ? { kind: 'error', message: 'We couldn’t remove that trip. Try again from your profile.' } : { kind: 'removed' });
  };

  const deleteRoute = async (routeId: string) => {
    setConfirmingDelete(false);
    await supabase.from('routes').delete().eq('id', routeId);
    await loadRoutes();
  };

  const ends = activeRoute ? routeEnds(activeRoute) : null;
  const from = ends ? (reversed ? ends.end : ends.start) : null;
  const to = ends ? (reversed ? ends.start : ends.end) : null;
  const pointPickups = from ? rankPickups(nearby.stations, nearby.statuses, from) : [];
  const pointDropoffs = to ? rankDropoffs(nearby.stations, nearby.statuses, to) : [];
  const walkPickups = from ? closestPickups(nearby.stations, nearby.statuses, from) : [];
  const walkDropoffs = to ? closestDropoffs(nearby.stations, nearby.statuses, to) : [];
  const priority: Priority = activeRoute ? (reversed ? activeRoute.reverse_priority : activeRoute.forward_priority) : 'balanced';
  const bestPickup = from ? recommendedPickup(nearby.stations, nearby.statuses, from, priority) : null;
  const bestDropoff = to ? recommendedDropoff(nearby.stations, nearby.statuses, to, priority) : null;
  const pickupsInBoth = sharedStationIds(pointPickups, walkPickups);
  const dropoffsInBoth = sharedStationIds(pointDropoffs, walkDropoffs);
  const stationsNearFrom = from ? stationsInRange(nearby.stations, from).length : 0;
  const stationsNearTo = to ? stationsInRange(nearby.stations, to).length : 0;
  const tripsMatch =
    pointPickups.length > 0 &&
    pointDropoffs.length > 0 &&
    pointPickups[0].station.station_id === walkPickups[0]?.station.station_id &&
    pointDropoffs[0].station.station_id === walkDropoffs[0]?.station.station_id;
  const pickupEmptyMessage =
    stationsNearFrom === 0
      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this start.`
      : `None of the ${stationsNearFrom} stations nearby has a bike right now. This page will update when one does.`;
  const dropoffEmptyMessage =
    stationsNearTo === 0
      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this destination.`
      : `None of the ${stationsNearTo} stations nearby has an open dock right now. This page will update when one does.`;
  // A delayed check still means the data is under 3 minutes old, so recommendations stay up.
  const showOptions = freshness === 'fresh' || freshness === 'delayed';
  const lastChangedStation = nearby.stations.find((station) => station.station_id === nearby.lastChange?.stationId);
  const showFirstRouteForm = routesLoaded && !routesFailed && routes.length === 0;

  return (
    <>
      <SiteHeader />
      <h1 className="sr-only">Your recommended trips</h1>
      <FreshnessBadge freshness={freshness} run={run} now={now} />

      {routesFailed && (
        <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad" role="alert">
          <h2 className="font-semibold">We couldn’t load your routes</h2>
          <p className="text-sm">Reload the page to try again.</p>
        </section>
      )}

      {routes.length > 0 && (
        <nav aria-label="Your routes" className="flex flex-wrap items-center gap-2">
          {routes.map((route) => (
            <button
              key={route.id}
              onClick={() => void activate(route.id)}
              aria-pressed={route.is_active}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold ${
                route.is_active ? 'border-bike bg-bike text-surface' : 'border-line bg-surface hover:border-bike'
              }`}
            >
              {route.name}
            </button>
          ))}
          <button
            onClick={() => setAdding(true)}
            className="cursor-pointer rounded-full border border-dashed border-line px-4 py-1.5 text-sm font-semibold text-muted hover:border-bike hover:text-ink"
          >
            Add a route
          </button>
        </nav>
      )}

      {showFirstRouteForm && <RouteForm isFirst onSaved={(route) => void onSaved(route)} onCancel={() => setAdding(false)} />}
      {adding && routes.length > 0 && (
        <RouteFormDialog onSaved={(route) => void onSaved(route)} onCancel={() => setAdding(false)} />
      )}

      {routesLoaded && routes.length > 0 && !activeRoute && !adding && (
        <p className="rounded-lg border border-dashed border-line p-4 text-muted">
          Choose a route above to see where to pick up and drop off.
        </p>
      )}

      {!routesLoaded && <LoadingCards />}

      {activeRoute && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {confirmingDelete ? (
                <>
                  <span>Delete {activeRoute.name}?</span>
                  <button onClick={() => void deleteRoute(activeRoute.id)} className="cursor-pointer font-semibold text-bad underline">
                    Delete route
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} className="cursor-pointer text-muted underline">
                    Keep it
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmingDelete(true)} className="cursor-pointer text-muted underline hover:text-ink">
                  Delete this route
                </button>
              )}
              <button
                onClick={() => setReversed(!reversed)}
                aria-pressed={reversed}
                className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1 font-semibold hover:border-bike"
              >
                {reversed ? 'Original direction' : 'Reverse direction'}
              </button>
            </div>
          </div>

          <FreshnessBanner freshness={freshness} run={run} now={now} />

          {tripNotice && (
            <p
              role="status"
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg p-4 text-sm ${tripNotice.kind === 'error' ? 'bg-warn-soft text-warn' : 'bg-bike-soft'}`}
            >
              {tripNotice.kind === 'error' && tripNotice.message}
              {tripNotice.kind === 'removed' && 'Trip removed from your points.'}
              {tripNotice.kind === 'saved' && (
                <>
                  <span className="font-semibold">Trip saved: +{tripNotice.points} points.</span>
                  <Link href="/profile" className="underline">
                    See your profile
                  </Link>
                  <button onClick={() => void undoTrip(tripNotice.tripId)} className="cursor-pointer underline">
                    Undo
                  </button>
                </>
              )}
            </p>
          )}

          {freshness === 'loading' || nearby.loading ? (
            <LoadingCards />
          ) : nearby.failed ? (
            <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad" role="alert">
              <h2 className="font-semibold">We couldn’t load nearby stations</h2>
              <p className="text-sm">Reload the page to try again.</p>
            </section>
          ) : showOptions ? (
            <>
              {bestPickup && bestDropoff && (
                <RecommendedTrip
                  pickup={bestPickup}
                  dropoff={bestDropoff}
                  start={from!}
                  end={to!}
                  priority={priority}
                  choosing={choosing}
                  onChoose={(pickup, dropoff) => void chooseTrip(pickup, dropoff)}
                />
              )}

              <div role="group" aria-label="Which list to show" className="flex overflow-hidden rounded-md border border-line bg-surface text-sm justify-self-start">
                {(['walk', 'points'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setListView(view)}
                    aria-pressed={listView === view}
                    className={`cursor-pointer px-4 py-1.5 font-semibold ${listView === view ? 'bg-bike text-surface' : 'text-muted hover:text-ink'}`}
                  >
                    {view === 'walk' ? 'Shortest walk' : 'Most points'}
                  </button>
                ))}
              </div>

              <div className="grid gap-8">
                {listView === 'walk' ? (
                <TripPlan
                  title="Shortest walk"
                  measure="miles"
                  pickups={walkPickups}
                  dropoffs={walkDropoffs}
                  pickupsInBoth={pickupsInBoth}
                  dropoffsInBoth={dropoffsInBoth}
                  changeCounts={nearby.changeCounts}
                  pickupEmptyMessage={pickupEmptyMessage}
                  dropoffEmptyMessage={dropoffEmptyMessage}
                  choosing={choosing}
                  onChoose={(pickup, dropoff) => void chooseTrip(pickup, dropoff)}
                />
                ) : (
                <TripPlan
                  title="Most points"
                  measure="points"
                  pickups={pointPickups}
                  dropoffs={pointDropoffs}
                  pickupsInBoth={pickupsInBoth}
                  dropoffsInBoth={dropoffsInBoth}
                  changeCounts={nearby.changeCounts}
                  note={tripsMatch ? "This is the same trip as the shortest walk right now." : undefined}
                  pickupEmptyMessage={pickupEmptyMessage}
                  dropoffEmptyMessage={dropoffEmptyMessage}
                  choosing={choosing}
                  onChoose={(pickup, dropoff) => void chooseTrip(pickup, dropoff)}
                />
                )}
              </div>

              <p className="font-mono text-xs text-muted" role="status">
                Watching {nearby.stations.length} {nearby.stations.length === 1 ? 'station' : 'stations'} on this route.{' '}
                {lastChangedStation && nearby.lastChange
                  ? `Last change: ${lastChangedStation.name.trim()}, ${timeAgo(nearby.lastChange.at, now)}.`
                  : 'Changes will appear here as bikes move.'}
              </p>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
