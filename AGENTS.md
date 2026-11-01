# Divvy Live

A commute app that helps rebalance Divvy bikes. A person saves named routes, each with a start and end address, and activates one at a time. The page recommends where to pick up and drop off a bike on the active route, with more points for full pick-up stations and empty drop-off stations. It updates without a refresh.

The data flow chart is in `docs/data-flow.html`. Read it before changing how data moves.

## Stack

- Page: Next.js and Tailwind CSS on Vercel's free Hobby plan
- Sign-in: Clerk
- Database and Realtime: Supabase, project ref `lcfvojxisfzinywezofl`
- Worker: Supabase Edge Function in `supabase/functions`, run by Supabase Cron every minute
- Source: Divvy's public GBFS feeds, `station_status` and `station_information`, no key needed
- Address lookup: U.S. Census geocoder, no key needed

Edge Functions run on Deno, so `supabase` must stay in the `exclude` list in `tsconfig.json`.

## Rules that keep the system working

- The worker saves only rows that changed. The `sync_divvy` database function compares bikes, e-bikes, docks and the renting and returning flags. Never compare `last_reported`: it changes constantly and would make most stations look changed.
- The comparison stays in the database. Having the worker download all 2,078 rows each minute would use up the free plan's data allowance.
- Only callers with the `worker_token` from Vault can start a run, because the worker's URL is public.
- The worker records every run in `worker_runs`, including failed runs. If Divvy's response has an unexpected shape, the run fails instead of saving blanks.
- The Supabase secret key stays on the server. It never goes in the code or in a `NEXT_PUBLIC_` variable.
- Realtime needs three things for each table: added to the `supabase_realtime` publication, read access granted, and a row-level security policy. If one is missing, the page gets nothing and shows no error.
- Each page subscribes only to the stations near its active route, to stay within the free Realtime message limit.
- Never store typed addresses. `routes` holds coordinates rounded to three decimals, and only their owner can read them.
- Switch the active route with the `set_active_route` database function, because a person can have only one active route at a time.

## Scoring

- Stations must be within 0.5 miles in a straight line.
- Pick-up points: `10 × bikes ÷ (bikes + docks)`. The station must be renting and have at least 1 bike.
- Drop-off points: `10 × docks ÷ (bikes + docks)`. The station must be accepting returns and have at least 1 dock.
- Do not divide by capacity. It is unreliable because of broken docks.
- The recommended trip at the top uses an internal score for each station: `w × (points ÷ 10) + (1 − w) × (1 − miles ÷ 0.5)`. It picks the best-scoring pick-up and drop-off from every usable station in range, and ties go to the shorter walk.
- `w` comes from the route's priority for that direction: 0.2 for walking, 0.5 for balanced, 0.8 for points. `routes.forward_priority` and `routes.reverse_priority` save it separately.
- Below it, the page has two sections, each with its own trip and top three pick-ups and drop-offs.
- Public racks are left out of all recommendations.
- Shortest walk ranks by distance, and ties go to more points. Most points ranks by points, and ties go to the shorter walk.

## Points and leaderboard

- Choosing a trip calls the `choose_trip` database function, which re-checks the stations and works out the points itself. Browsers can't insert or edit trips, so scores can't be typed in.
- It can't tell whether a ride really happened. Trips are on the honor system, with a 30 minute wait between them.
- `leaderboard()` returns display names and totals only. Other riders never see emails, user ids, routes or stations.
- `choose_trip` and `leaderboard` are security definer functions that signed-in people are meant to call, so the two Supabase advisor warnings about them are expected.
- These points are the app's own estimate. The public feeds have no Bike Angels data.

## Page states

- Loading: the first read has not finished.
- Fresh: the newest run succeeded within the last 3 minutes.
- Stale: the newest run is more than 3 minutes old. The browser checks this on its own clock, because a stopped worker sends nothing. Hide recommendations.
- Down: the newest run failed. Hide recommendations.
- Also design for no stations within range, and no bikes or docks available nearby.

## Free tier limits

Stay on free plans and do not add payment methods. Supabase's free plan includes 500,000 Edge Function calls a month, and running every minute uses about 43,000. A free project pauses after a week without use.

## Working in this repo

This is a class project and a one-shot build is marked incomplete. Work in small steps, commit often, and explain what each part does so the owner can explain it in class.

Schema changes go in `supabase/migrations`. Apply them through the Supabase MCP server and keep the file in the repo.

## Tests

- `node --test supabase/tests/divvy-worker.test.ts` runs the worker's logic on a saved copy of Divvy's response in `supabase/tests/fixtures`, with a fake database.
- `supabase/tests/sync_divvy.sql` checks what the database saves, and `supabase/tests/choose_trip.sql` checks trips and the leaderboard. Run them through the Supabase MCP server. They always end with an exception that rolls back their changes, and success reads `ALL PASSED`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
