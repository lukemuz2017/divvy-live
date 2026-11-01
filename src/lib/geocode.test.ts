// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GeocoderUnavailableError, parseGeocoderResponse, roundCoordinate, withDefaultCity } from './geocode.ts';

test('adds Chicago when only a street is typed', () => {
  assert.equal(withDefaultCity(' 233 S Wacker Dr '), '233 S Wacker Dr, Chicago, IL');
});

test('leaves an address alone when it already has a city or ZIP code', () => {
  assert.equal(withDefaultCity('1 Main St, Evanston, IL'), '1 Main St, Evanston, IL');
  assert.equal(withDefaultCity('233 S Wacker Dr 60606'), '233 S Wacker Dr 60606');
});

test('reads coordinates from a Census response, where x is longitude and y is latitude', () => {
  const response = { result: { addressMatches: [{ coordinates: { x: -87.636602278191, y: 41.878919545908 } }] } };
  assert.deepEqual(parseGeocoderResponse(response), { lat: 41.878919545908, lon: -87.636602278191 });
});

test('reports no match when Census finds nothing', () => {
  assert.equal(parseGeocoderResponse({ result: { addressMatches: [] } }), null);
});

test('treats an unexpected response as the lookup being unavailable, not a bad address', () => {
  assert.throws(() => parseGeocoderResponse({ errors: ['oops'] }), GeocoderUnavailableError);
});

test('rounds coordinates to about a block', () => {
  assert.equal(roundCoordinate(41.878919), 41.879);
  assert.equal(roundCoordinate(-87.636602), -87.637);
});
