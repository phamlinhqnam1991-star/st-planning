# V517 · Global multi-tab stability / shared DB pool protection

## Scope
Fix only the shared realtime reconciliation and PostgreSQL pool behavior that can make multiple different tabs fail with `This page couldn’t load`. No Planning/Batch/Schedule/Production/Masking business rule changes.

## Root cause addressed
- Hidden browser tabs still called `router.refresh()` for relevant realtime events. With Planning, Scheduling, Production, Dashboard and other heavy pages open together, one mutation could trigger several expensive RSC renders and PostgreSQL workloads at the same time.
- Returning to a tab after more than five seconds also forced an unconditional refresh even when no relevant change occurred.
- `src/lib/db.ts` wrapped `pool.connect()` / `pool.query()` in a manual `Promise.race` timeout and called `pool.end()` on timeout. A timed-out checkout can remain queued, and ending the shared runtime pool from one request can interrupt unrelated requests being served for other tabs.
- Vercel runtime idle PostgreSQL connections were retained for 30 seconds, increasing pressure on Aiven's small connection budget.

## Fix
- Only a visible, relevant page may perform an RSC soft refresh.
- Hidden tabs set one dirty flag and never background-refresh. When the user returns, they reconcile at most once; remote events missed during sleep are picked up by the leader feed and coalesced through the same path.
- Visible RSC refreshes are debounced and have a 4-second minimum cooldown, so bursts of mutations become one refresh.
- Unknown/static routes no longer opt into automatic RSC refresh; client islands can still listen to the global realtime event.
- Removed manual Promise-race DB timeouts and never tear down the shared pool because one request is slow. PostgreSQL/pg `connectionTimeoutMillis`, `query_timeout` and `statement_timeout` are used instead.
- Default idle runtime DB connection lifetime reduced from 30s to 5s (`DB_IDLE_TIMEOUT_MS` configurable) to return scarce Aiven connections sooner.
- No SQL migration required.

## Unchanged
Global Realtime No-Supabase event table/feed, Internal Chat, READY/WAIT, Planning Chain, Recipe, Batch, Chemical/Paint scheduling, Masking Estimate formula/configuration, Production execution and Shift Accept rules.
