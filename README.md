# Divvy Live

A commute app that helps rebalance Divvy bikes. Save named routes, activate one, and see the best places to pick up and drop off a bike right now. You earn more points for taking a bike from a full station and returning it to an empty one, within a half-mile walk of each end of your route. The page updates on its own.

The data flow chart is in [`docs/data-flow.html`](docs/data-flow.html).

## How it works

1. **Source:** Divvy's public feeds, `station_status` and `station_information`, with no key needed.
2. **Worker:** a Supabase Edge Function in `supabase/functions/divvy-worker`, run every minute by Supabase Cron. It checks the feed, sends it to the database, and records each run in `worker_runs`.
3. **Database:** the `sync_divvy` function writes only the stations that changed. Each person's routes are protected by row-level security.
4. **Page:** Next.js on Vercel. Supabase Realtime pushes changes for stations near the active route, and the browser recalculates the recommendations.

The page shows how recently the worker checked Divvy. If the data is more than 3 minutes old or the last check failed, it hides recommendations.

## Running it

```
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` with your Clerk and Supabase keys. `clerk env pull` fetches the Clerk ones.

## Tests

- `npm test` runs the worker on a saved copy of Divvy's response, plus the scoring and address rules.
- `supabase/tests/sync_divvy.sql` checks what the database saves. It rolls back its changes when it finishes.

A class project for Design, Build, Ship. Not affiliated with Divvy or Lyft.
