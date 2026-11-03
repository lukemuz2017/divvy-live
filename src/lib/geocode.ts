// Turns a typed address into coordinates using the U.S. Census geocoder, which needs no key.
import type { Point } from './scoring.ts';

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const TIMEOUT_MS = 10_000;

export class AddressNotFoundError extends Error {}
export class GeocoderUnavailableError extends Error {}
export class OutsideChicagoError extends Error {}

// People will often type just the street, and the geocoder needs a city to find it.
export function withDefaultCity(address: string): string {
  const trimmed = address.trim();
  return /,|\b\d{5}\b/.test(trimmed) ? trimmed : `${trimmed}, Chicago, IL`;
}

// The Census returns the matched address in capitals, like "233 S WACKER DR, CHICAGO, IL, 60606".
export function isInChicago(matchedAddress: unknown): boolean {
  return typeof matchedAddress === 'string' && /, CHICAGO, IL\b/i.test(matchedAddress);
}

export function parseGeocoderResponse(response: unknown): (Point & { matchedAddress?: string }) | null {
  const matches = (response as { result?: { addressMatches?: unknown } } | null)?.result?.addressMatches;
  if (!Array.isArray(matches)) {
    throw new GeocoderUnavailableError('The address lookup returned an unexpected response');
  }
  const coordinates = matches[0]?.coordinates;
  if (typeof coordinates?.x !== 'number' || typeof coordinates?.y !== 'number') return null;
  return { lat: coordinates.y, lon: coordinates.x, matchedAddress: matches[0]?.matchedAddress };
}

// Three decimals is about a block, which is all the walking estimates need.
export const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000;

export async function geocode(address: string): Promise<Point> {
  const params = new URLSearchParams({
    address: withDefaultCity(address),
    benchmark: 'Public_AR_Current',
    format: 'json',
  });

  let body: unknown;
  try {
    const response = await fetch(`${GEOCODER_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    body = await response.json();
  } catch {
    throw new GeocoderUnavailableError('The address lookup is not responding');
  }

  const point = parseGeocoderResponse(body);
  if (!point) throw new AddressNotFoundError('Address not found');
  // Routes are for Chicago only.
  if (!isInChicago(point.matchedAddress)) throw new OutsideChicagoError('Address is outside Chicago');
  return { lat: roundCoordinate(point.lat), lon: roundCoordinate(point.lon) };
}
