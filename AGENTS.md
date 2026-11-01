# Divvy Live

A commute app that helps rebalance Divvy bikes. A person saves home and work addresses, and the page recommends where to pick up and drop off a bike, with more points for full pick-up stations and empty drop-off stations. It updates without a refresh.

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

- The worker saves only rows that changed. Compare bikes, e-bikes, docks and the renting and returning flags. Never compare `last_reported`: it changes constantly and would make most stations look changed.
- The worker records every run in `worker_runs`, including failed runs. If Divvy's response has an unexpected shape, the run fails instead of saving blanks.
- The Supabase secret key stays on the server. It never goes in the code or in a `NEXT_PUBLIC_` variable.
- Realtime needs three things for each table: added to the `supabase_realtime` publication, read access granted, and a row-level security policy. If one is missing, the page gets nothing and shows no error.
- Each page subscribes only to its nearby stations, to stay within the free Realtime message limit.
- Never store typed addresses. `commutes` holds coordinates rounded to three decimals, and only their owner can read them.

## Scoring

- Stations must be within 0.5 miles in a straight line.
- Pick-up points: `10 × bikes ÷ (bikes + docks)`. The station must be renting and have at least 1 bike.
- Drop-off points: `10 × docks ÷ (bikes + docks)`. The station must be accepting returns and have at least 1 dock.
- Do not divide by capacity. It is unreliable because of broken docks.
- Show the top three of each. Ties go to the shorter walk.

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
