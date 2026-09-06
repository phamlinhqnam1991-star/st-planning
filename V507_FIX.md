# V507 — Global Realtime Sync (no F5)

## Scope agreed
All ST Planning screens must stay synchronized automatically without users pressing Refresh/F5.

## Architecture
- Aiven PostgreSQL remains the canonical operational database.
- Supabase Realtime Broadcast is used only as a lightweight cross-device invalidation signal bus; no Planning/Master/Dashboard data is read/written through Supabase REST.
- Browser `BroadcastChannel` + `localStorage` storage events synchronize tabs on the same PC.
- A root `StRealtimeProvider` intercepts successful mutating `/api/*` requests and publishes one deduplicated change event.
- Receiving tabs/browsers run a Next.js RSC soft refresh (`router.refresh`) and existing fine-grained schedule loaders. This does not reload the browser document and does not require F5.
- Events are debounced to avoid refresh storms when one operation performs several writes.
- When a hidden tab becomes visible again or Realtime reconnects, it automatically reconciles canonical data to recover any missed event.

## Covered domains
Planning, Batch, Scheduling, Production Execution, Remove/Add Job, Shift Accept, Daily Production Adjustment, Dashboard/Audit dependencies, Import, Master Data, Config/Recipe/Area, Admin and Internal Chat mutations.

## Explicit non-business/read-only exclusions
Login/logout, Planning personal Board View, Dashboard AI, simulations/suggestions/diagnostics and signed upload URL generation do not broadcast global business invalidations.

## Runtime requirement
For realtime push between different PCs/browsers configure:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Without those keys, same-PC tabs still synchronize, but cross-device push is unavailable.

## Business logic
No READY/WAIT, Planning Chain, Recipe, Batch, Schedule, Production, V506 Remove Before Start or audit business rule was changed.
