'use client';

import 'leaflet/dist/leaflet.css';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import type { Point } from '@/lib/scoring';

type Leaflet = typeof import('leaflet');

// OpenStreetMap's own tiles: free with no key, as long as the credit line shows and use stays light.
// They only come in a light style, so dark mode darkens them with a CSS filter in globals.css.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const latLng = (p: Point): [number, number] => [p.lat, p.lon];

// A small map of the whole recommended trip: walk to the pick-up, ride, then walk from the drop-off.
// Lines are straight, not street directions.
export function TripMap({
  start,
  pickup,
  dropoff,
  end,
  pickupName,
  dropoffName,
}: {
  start: Point;
  pickup: Point;
  dropoff: Point;
  end: Point;
  pickupName: string;
  dropoffName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const overlaysRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const fittedTripRef = useRef<string | null>(null);

  // Leaflet needs the browser's window, so it loads here instead of at import time.
  useEffect(() => {
    let cancelled = false;

    void import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      // Zoom buttons and pinch work, but the scroll wheel stays off so scrolling the page never gets stuck on the map.
      const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true });
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      overlaysRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Redraws when the recommendation changes, so the map follows live updates.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const overlays = overlaysRef.current;
    if (!ready || !L || !map || !overlays) return;
    overlays.clearLayers();

    const bike = token('--bike');
    const ink = token('--ink');
    const surface = token('--surface');

    const walk = { color: ink, weight: 4, opacity: 0.85, dashArray: '1 9', lineCap: 'round' as const, className: 'map-walk', interactive: false };
    L.polyline([latLng(start), latLng(pickup)], walk).addTo(overlays);
    L.polyline([latLng(dropoff), latLng(end)], walk).addTo(overlays);
    L.polyline([latLng(pickup), latLng(dropoff)], { color: bike, weight: 4, opacity: 0.9, interactive: false }).addTo(overlays);

    const place = (p: Point, label: string, html: string, size: number) =>
      L.marker(latLng(p), { icon: L.divIcon({ className: '', iconSize: [size, size], html }), title: label, keyboard: false }).addTo(overlays);

    place(start, 'Your start', `<div style="width:14px;height:14px;border-radius:3px;background:${ink};border:2px solid ${surface}"></div>`, 14);
    place(end, 'Your destination', `<div style="width:14px;height:14px;border-radius:50%;background:${ink};border:2px solid ${surface}"></div>`, 14);
    place(pickup, `Pick up: ${pickupName}`, `<div class="live-pulse" style="width:18px;height:18px;border-radius:50%;background:${bike};border:3px solid ${surface}"></div>`, 18);
    place(dropoff, `Drop off: ${dropoffName}`, `<div style="width:18px;height:18px;border-radius:50%;background:${surface};border:4px solid ${bike}"></div>`, 18);

    // Re-center only when the trip itself changes. The page re-renders every second, and re-centering
    // each time would undo any zooming or dragging.
    const trip = [start, pickup, dropoff, end].map((p) => `${p.lat},${p.lon}`).join('|');
    if (fittedTripRef.current !== trip) {
      fittedTripRef.current = trip;
      map.fitBounds(L.latLngBounds([start, pickup, dropoff, end].map(latLng)), { padding: [24, 24], maxZoom: 16 });
    }
  }, [ready, start.lat, start.lon, pickup.lat, pickup.lon, dropoff.lat, dropoff.lon, end.lat, end.lon, pickupName, dropoffName]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map of the trip: walk to ${pickupName}, ride to ${dropoffName}, then walk to your destination`}
      className="trip-map h-56 w-full overflow-hidden rounded-md border border-line bg-bg"
    />
  );
}
