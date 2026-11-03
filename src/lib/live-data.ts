'use client';

import { useAuth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { boundsAround, DELAYED_AFTER_MS, isCompleteRun, isCompleteStatus, stationsInRange } from './scoring.ts';

// While the data looks old, the page rechecks the database this often instead of trusting Realtime.
const RECHECK_MS = 30_000;
import type { Point, Priority, Station, StationStatus, WorkerRun } from './scoring.ts';

// Realtime filters accept up to 100 values, so each end of a route watches its 50 nearest stations.
const MAX_STATIONS_PER_END = 50;

export type Route = {
  id: string;
  name: string;
  is_active: boolean;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  forward_priority: Priority;
  on_dashboard: boolean;
  reverse_priority: Priority;
};

export function routeEnds(route: Route): { start: Point; end: Point } {
  return {
    start: { lat: Number(route.start_lat), lon: Number(route.start_lon) },
    end: { lat: Number(route.end_lat), lon: Number(route.end_lon) },
  };
}

// Sends the person's Clerk token with every request, which is what row-level security reads.
export function useSupabase(): SupabaseClient {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  return useMemo(
    () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        accessToken: async () => (await getTokenRef.current()) ?? null,
      }),
    [],
  );
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Runs a reload when the tab comes back, because a phone that slept may have missed pushes.
function useReloadOnReturn(reload: () => void) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}

export function useLatestRun(supabase: SupabaseClient) {
  const [run, setRun] = useState<WorkerRun | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('worker_runs')
      .select('id, ran_at, ok, rows_changed, error')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setRun(data);
    setLoaded(true);
  };

  useEffect(() => {
    // Reloading on every subscribe also catches anything missed while disconnected.
    const channel = supabase
      .channel('worker-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'worker_runs' }, (payload) => {
        if (isCompleteRun(payload.new)) setRun(payload.new);
        else void load();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    void load();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useReloadOnReturn(() => void load());

  // A Realtime connection can drop without any error. If no run has arrived lately, ask the database
  // directly, so the page only says the data is old when it really is.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(() => {
    const timer = setInterval(() => {
      const latest = runRef.current;
      if (!latest || Date.now() - new Date(latest.ran_at).getTime() > DELAYED_AFTER_MS) void load();
    }, RECHECK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  return { run, loaded };
}

export type LastChange = { stationId: string; at: number };

export function useNearbyStations(supabase: SupabaseClient, route: Route | null) {
  const [stations, setStations] = useState<Station[]>([]);
  const [statuses, setStatuses] = useState<Map<string, StationStatus>>(new Map());
  const [changeCounts, setChangeCounts] = useState<Map<string, number>>(new Map());
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const idsRef = useRef<string[]>([]);

  const loadStatuses = async () => {
    const ids = idsRef.current;
    if (ids.length === 0) return;
    const { data, error } = await supabase
      .from('station_status')
      .select('station_id, bikes, ebikes, docks, is_renting, is_returning, updated_at')
      .in('station_id', ids);
    if (error) {
      setFailed(true);
      return;
    }
    setStatuses(new Map((data as StationStatus[]).map((row) => [row.station_id, row])));
  };

  useEffect(() => {
    setStations([]);
    setStatuses(new Map());
    setChangeCounts(new Map());
    setLastChange(null);
    setFailed(false);
    idsRef.current = [];
    if (!route) return;

    let cancelled = false;
    let channel: ReturnType<SupabaseClient['channel']> | null = null;
    setLoading(true);

    const findNear = async (point: Point): Promise<Station[]> => {
      const box = boundsAround(point);
      const { data, error } = await supabase
        .from('stations')
        .select('station_id, name, lat, lon, capacity')
        .gte('lat', box.minLat)
        .lte('lat', box.maxLat)
        .gte('lon', box.minLon)
        .lte('lon', box.maxLon);
      if (error) throw error;
      return stationsInRange(data as Station[], point).slice(0, MAX_STATIONS_PER_END);
    };

    const start = async () => {
      const ends = routeEnds(route);
      const [nearStart, nearEnd] = await Promise.all([findNear(ends.start), findNear(ends.end)]);
      if (cancelled) return;

      const unique = new Map([...nearStart, ...nearEnd].map((station) => [station.station_id, station]));
      const ids = [...unique.keys()];
      idsRef.current = ids;
      setStations([...unique.values()]);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      await loadStatuses();
      if (cancelled) return;
      setLoading(false);

      // Only stations near this route are pushed here, which keeps Realtime within the free limit.
      channel = supabase
        .channel(`stations-${route.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'station_status', filter: `station_id=in.(${ids.join(',')})` },
          (payload) => {
            const row = payload.new;
            if (!isCompleteStatus(row)) {
              void loadStatuses();
              return;
            }
            setStatuses((previous) => new Map(previous).set(row.station_id, row));
            setChangeCounts((previous) => new Map(previous).set(row.station_id, (previous.get(row.station_id) ?? 0) + 1));
            setLastChange({ stationId: row.station_id, at: Date.now() });
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void loadStatuses();
        });
    };

    start().catch(() => {
      if (!cancelled) {
        setFailed(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // Coordinates can't change on a saved route, so its id is enough to know when to restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, route?.id]);

  useReloadOnReturn(() => void loadStatuses());

  return { stations, statuses, changeCounts, lastChange, loading, failed, reload: loadStatuses };
}
