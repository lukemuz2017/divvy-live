'use client';

import { useAuth, UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { routeEnds, useLatestRun, useNearbyStations, useNow, useSupabase } from '@/lib/live-data';
import type { Route } from '@/lib/live-data';
import { freshnessOf, MAX_WALK_MILES, rankDropoffs, rankPickups, stationsInRange } from '@/lib/scoring';
import { FreshnessBadge, FreshnessBanner, timeAgo } from './FreshnessBadge';
import { RouteForm } from './RouteForm';
import { StationOptions } from './StationOptions';

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
  const now = useNow(1000);
  const { run, loaded: runLoaded } = useLatestRun(supabase);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [routesFailed, setRoutesFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
    setConfirmingDelete(false);
    setRoutes((previous) => previous.map((route) => ({ ...route, is_active: route.id === routeId })));
    const { error } = await supabase.rpc('set_active_route', { route_id: routeId });
    if (error) await loadRoutes();
  };

  const onSaved = async (route: Route) => {
    setAdding(false);
    setRoutes((previous) => [...previous, route]);
    await activate(route.id);
  };

  const deleteActive = async () => {
    if (!activeRoute) return;
    setConfirmingDelete(false);
    await supabase.from('routes').delete().eq('id', activeRoute.id);
    await loadRoutes();
  };

  const ends = activeRoute ? routeEnds(activeRoute) : null;
  const from = ends ? (reversed ? ends.end : ends.start) : null;
  const to = ends ? (reversed ? ends.start : ends.end) : null;
  const pickups = from ? rankPickups(nearby.stations, nearby.statuses, from) : [];
  const dropoffs = to ? rankDropoffs(nearby.stations, nearby.statuses, to) : [];
  const stationsNearFrom = from ? stationsInRange(nearby.stations, from).length : 0;
  const stationsNearTo = to ? stationsInRange(nearby.stations, to).length : 0;
  const bestPickup = pickups[0];
  const bestDropoff = dropoffs[0];
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
        <UserButton />
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
              <section className="grid gap-4 rounded-lg border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-muted">
                    Best trip right now on {activeRoute.name}
                    {reversed ? ', reversed' : ''}
                  </h2>
                  <button
                    onClick={() => setReversed(!reversed)}
                    aria-pressed={reversed}
                    className="cursor-pointer rounded-md border border-line px-3 py-1 text-sm font-semibold hover:border-bike"
                  >
                    Reverse direction
                  </button>
                </div>
                {bestPickup && bestDropoff ? (
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="grid min-w-0 gap-1 text-xl font-bold text-balance md:text-2xl">
                      <p>
                        <span className="font-normal text-muted">From </span>
                        {bestPickup.station.name}
                      </p>
                      <p>
                        <span className="font-normal text-muted">to </span>
                        {bestDropoff.station.name}
                      </p>
                    </div>
                    <p className="font-mono text-3xl font-medium text-bike md:text-4xl">
                      +{bestPickup.points + bestDropoff.points}
                      <span className="ml-1 text-base">pts</span>
                    </p>
                  </div>
                ) : (
                  <p className="text-muted">We can’t recommend a full trip right now. See what’s available below.</p>
                )}
              </section>

              <div className="grid gap-6 md:grid-cols-2">
                <StationOptions
                  title="Pick up"
                  options={pickups}
                  changeCounts={nearby.changeCounts}
                  emptyMessage={
                    stationsNearFrom === 0
                      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this start.`
                      : `None of the ${stationsNearFrom} stations nearby has a bike right now. This page will update when one does.`
                  }
                />
                <StationOptions
                  title="Drop off"
                  options={dropoffs}
                  changeCounts={nearby.changeCounts}
                  emptyMessage={
                    stationsNearTo === 0
                      ? `No Divvy stations within ${MAX_WALK_MILES} miles of this destination.`
                      : `None of the ${stationsNearTo} stations nearby has an open dock right now. This page will update when one does.`
                  }
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

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {confirmingDelete ? (
              <>
                <span>Delete {activeRoute.name}?</span>
                <button onClick={() => void deleteActive()} className="cursor-pointer font-semibold text-bad underline">
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
          </div>
        </>
      )}
    </>
  );
}
