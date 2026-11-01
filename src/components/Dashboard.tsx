'use client';

import { useAuth, UserButton, useUser } from '@clerk/nextjs';
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
import { FreshnessBadge, FreshnessBanner, timeAgo } from './FreshnessBadge';
import { RouteForm } from './RouteForm';
import { RoutesPanel } from './RoutesPanel';
import { RecommendedTrip, TripPlan } from './TripPlan';

// Used unless the person has uploaded their own photo.
const DEFAULT_AVATAR_APPEARANCE = {
  elements: {
    userButtonAvatarBox: 'divvy-avatar',
    userButtonAvatarImage: 'divvy-avatar-image',
    userPreviewAvatarBox: 'divvy-avatar',
    userPreviewAvatarImage: 'divvy-avatar-image',
  },
};

function RoutesIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="3.5" cy="3.5" r="2" />
      <circle cx="12.5" cy="12.5" r="2" />
      <path d="M5.5 3.5h5a2.5 2.5 0 0 1 0 5h-5a2.5 2.5 0 0 0 0 5h5" />
    </svg>
  );
}

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
        A class project using Divvy’s public data. Not affiliated with Divvy or Lyft. Walk times are straight-line
        estimates.
      </footer>
    </div>
  );
}

function LiveDashboard() {
  const supabase = useSupabase();
  const { user } = useUser();
  const now = useNow(1000);
  const { run, loaded: runLoaded } = useLatestRun(supabase);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [routesFailed, setRoutesFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [showingAllRoutes, setShowingAllRoutes] = useState(false);
  const [reversed, setReversed] = useState(false);

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
    setConfirmingDeleteId(null);
    setRoutes((previous) => previous.map((route) => ({ ...route, is_active: route.id === routeId })));
    const { error } = await supabase.rpc('set_active_route', { route_id: routeId });
    if (error) await loadRoutes();
  };

  const onSaved = async (route: Route) => {
    setAdding(false);
    setRoutes((previous) => [...previous, route]);
    await activate(route.id);
  };

  const deleteRoute = async (routeId: string) => {
    setConfirmingDeleteId(null);
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
  const bestPickup = from ? recommendedPickup(nearby.stations, nearby.statuses, from) : null;
  const bestDropoff = to ? recommendedDropoff(nearby.stations, nearby.statuses, to) : null;
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
  const showOptions = freshness === 'fresh';
  const lastChangedStation = nearby.stations.find((station) => station.station_id === nearby.lastChange?.stationId);
  const showForm = routesLoaded && !routesFailed && (adding || routes.length === 0);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight">Divvy Live</h1>
          <FreshnessBadge freshness={freshness} run={run} now={now} />
        </div>
        <UserButton appearance={user?.hasImage ? undefined : DEFAULT_AVATAR_APPEARANCE}>
          <UserButton.MenuItems>
            <UserButton.Action
              label="Saved routes"
              labelIcon={<RoutesIcon />}
              onClick={() => setShowingAllRoutes(true)}
            />
          </UserButton.MenuItems>
        </UserButton>
      </header>

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

      {showingAllRoutes && routes.length > 0 && (
        <RoutesPanel
          routes={routes}
          confirmingDeleteId={confirmingDeleteId}
          onUse={(routeId) => void activate(routeId)}
          onAskDelete={setConfirmingDeleteId}
          onCancelDelete={() => setConfirmingDeleteId(null)}
          onDelete={(routeId) => void deleteRoute(routeId)}
          onClose={() => setShowingAllRoutes(false)}
        />
      )}

      {showForm && (
        <RouteForm isFirst={routes.length === 0} onSaved={(route) => void onSaved(route)} onCancel={() => setAdding(false)} />
      )}

      {routesLoaded && routes.length > 0 && !activeRoute && !adding && (
        <p className="rounded-lg border border-dashed border-line p-4 text-muted">
          Choose a route above to see where to pick up and drop off.
        </p>
      )}

      {!routesLoaded && <LoadingCards />}

      {activeRoute && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted">
              Right now on {activeRoute.name}
              {reversed ? ', reversed' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {confirmingDeleteId === activeRoute.id && !showingAllRoutes ? (
                <>
                  <span>Delete {activeRoute.name}?</span>
                  <button onClick={() => void deleteRoute(activeRoute.id)} className="cursor-pointer font-semibold text-bad underline">
                    Delete route
                  </button>
                  <button onClick={() => setConfirmingDeleteId(null)} className="cursor-pointer text-muted underline">
                    Keep it
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmingDeleteId(activeRoute.id)} className="cursor-pointer text-muted underline hover:text-ink">
                  Delete this route
                </button>
              )}
              <button
                onClick={() => setReversed(!reversed)}
                aria-pressed={reversed}
                className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1 font-semibold hover:border-bike"
              >
                Reverse direction
              </button>
            </div>
          </div>

          <FreshnessBanner freshness={freshness} run={run} now={now} />

          {freshness === 'loading' || nearby.loading ? (
            <LoadingCards />
          ) : nearby.failed ? (
            <section className="grid gap-1 rounded-lg bg-bad-soft p-4 text-bad" role="alert">
              <h2 className="font-semibold">We couldn’t load nearby stations</h2>
              <p className="text-sm">Reload the page to try again.</p>
            </section>
          ) : showOptions ? (
            <>
              {bestPickup && bestDropoff && <RecommendedTrip pickup={bestPickup} dropoff={bestDropoff} />}

              <div className="grid gap-8 md:grid-cols-2 md:gap-6">
                <TripPlan
                  title="Shortest walk"
                  description="The closest stations with a bike to take and a dock to return it to."
                  measure="miles"
                  pickups={walkPickups}
                  dropoffs={walkDropoffs}
                  pickupsInBoth={pickupsInBoth}
                  dropoffsInBoth={dropoffsInBoth}
                  changeCounts={nearby.changeCounts}
                  pickupEmptyMessage={pickupEmptyMessage}
                  dropoffEmptyMessage={dropoffEmptyMessage}
                />
                <TripPlan
                  title="Most points"
                  description="The stations that need the most help, within a half-mile walk of each end."
                  measure="points"
                  pickups={pointPickups}
                  dropoffs={pointDropoffs}
                  pickupsInBoth={pickupsInBoth}
                  dropoffsInBoth={dropoffsInBoth}
                  changeCounts={nearby.changeCounts}
                  note={tripsMatch ? 'This is the same trip as the shortest walk right now.' : undefined}
                  pickupEmptyMessage={pickupEmptyMessage}
                  dropoffEmptyMessage={dropoffEmptyMessage}
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
    </>
  );
}
