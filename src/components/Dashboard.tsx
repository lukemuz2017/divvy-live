'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import { routeEnds, useLatestRun, useNearbyStations, useNow, useSupabase } from '@/lib/live-data';
import type { Route } from '@/lib/live-data';
import {
  closestDropoffs,
  closestPickups,
  freshnessOf,
  MAX_WALK_MILES,
  rankDropoffs,
  rankPickups,
  balancedDropoffs,
  balancedPickups,
  stationsInRange,
} from '@/lib/scoring';
import type { Priority, Recommendation } from '@/lib/scoring';
import { FreshnessBadge, FreshnessBanner, timeAgo } from './FreshnessBadge';
import { RouteForm, RouteFormDialog } from './RouteForm';
import { SiteHeader } from './SiteHeader';
import { StationOptions } from './StationOptions';
import { TripCard } from './TripPlan';


type TripNotice = { kind: 'saved'; points: number; pickupName: string; dropoffName: string } | { kind: 'error'; message: string };

// How long the trip-saved pop-up stays before it fades.
const SAVED_TOAST_MS = 4000;

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

  // The saved pop-up clears itself. Errors stay until the next action so they aren't missed.
  useEffect(() => {
    if (tripNotice?.kind !== 'saved') return;
    const timer = setTimeout(() => setTripNotice(null), SAVED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [tripNotice]);
  // Null means use the route's saved priority for this direction.
  const [viewChoice, setViewChoice] = useState<Priority | null>(null);

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
    setViewChoice(null);
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
    else setTripNotice({ kind: 'saved', points: data.points, pickupName: pickup.station.name.trim(), dropoffName: dropoff.station.name.trim() });
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
  const view: Priority = viewChoice ?? priority;
  const balancedPickupList = from ? balancedPickups(nearby.stations, nearby.statuses, from) : [];
  const balancedDropoffList = to ? balancedDropoffs(nearby.stations, nearby.statuses, to) : [];
  const viewPickups = view === 'walk' ? walkPickups : view === 'points' ? pointPickups : balancedPickupList;
  const viewDropoffs = view === 'walk' ? walkDropoffs : view === 'points' ? pointDropoffs : balancedDropoffList;
  const stationsNearFrom = from ? stationsInRange(nearby.stations, from).length : 0;
  const stationsNearTo = to ? stationsInRange(nearby.stations, to).length : 0;
  const pickupEmptyMessage =
    stationsNearFrom === 0
      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this start.`
      : `None of the ${stationsNearFrom} stations nearby has a bike right now. This page will update when one does.`;
  const dropoffEmptyMessage =
    stationsNearTo === 0
      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this destination.`
      : `None of the ${stationsNearTo} stations nearby has an open dock right now. This page will update when one does.`;
  // A delayed check still means the data is under 3 minutes old, so recommendations stay up.
  // Recommendations stay up even when the data is old. The banner above them says so, and choosing a trip
  // waits for current data because the database won't score old counts.
  const showOptions = freshness !== 'loading';
  const canChoose = freshness === 'fresh' || freshness === 'delayed';
  const wasCurrentRef = useRef(true);
  useEffect(() => {
    if (freshness === 'loading') return;
    const current = freshness === 'fresh';
    // Coming back to current data after a gap means station pushes may have been missed too.
    if (current && !wasCurrentRef.current) nearby.reload();
    wasCurrentRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshness]);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          {activeRoute && (
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
                onClick={() => {
                  setReversed(!reversed);
                  setViewChoice(null);
                }}
                aria-pressed={reversed}
                className="cursor-pointer rounded-full border border-line bg-surface px-4 py-1.5 font-semibold hover:border-bike"
              >
                {reversed ? 'Original direction' : 'Reverse direction'}
              </button>
            </div>
          )}
        </div>
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
          <FreshnessBanner freshness={freshness} run={run} now={now} />

          {tripNotice?.kind === 'error' && (
            <p role="alert" className="rounded-lg bg-warn-soft p-4 text-sm text-warn">
              {tripNotice.message}
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
              <TripCard
                view={view}
                onViewChange={setViewChoice}
                pickup={viewPickups[0]}
                dropoff={viewDropoffs[0]}
                start={from!}
                end={to!}
                choosing={choosing}
                canChoose={canChoose}
                onChoose={(pickup, dropoff) => void chooseTrip(pickup, dropoff)}
              />

              {/* Side by side on wider screens, stacked on phones. */}
              <div className="grid gap-5 md:grid-cols-2">
                <StationOptions
                  title="Pick up"
                  options={viewPickups}
                  measure={view === 'points' ? 'points' : view === 'walk' ? 'miles' : 'both'}
                  changeCounts={nearby.changeCounts}
                  emptyMessage={pickupEmptyMessage}
                />
                <StationOptions
                  title="Drop off"
                  options={viewDropoffs}
                  measure={view === 'points' ? 'points' : view === 'walk' ? 'miles' : 'both'}
                  changeCounts={nearby.changeCounts}
                  emptyMessage={dropoffEmptyMessage}
                />
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
      {tripNotice?.kind === 'saved' && (
        <div
          role="status"
          className="trip-toast fixed inset-x-0 bottom-0 z-[1000] mx-auto mb-[max(1rem,env(safe-area-inset-bottom))] w-[min(28rem,calc(100%-2rem))] rounded-lg border border-bike bg-surface p-4 shadow-lg"
        >
          <p className="font-semibold">
            Trip saved: <span className="font-mono text-bike">+{tripNotice.points} points</span>
          </p>
          <p className="text-sm text-muted">
            {tripNotice.pickupName} to {tripNotice.dropoffName}
          </p>
        </div>
      )}
    </>
  );
}
