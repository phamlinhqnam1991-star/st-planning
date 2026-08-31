# v286 — Configuration Performance

Scope: performance only for Configuration routes. Business/master-data logic is unchanged. v285 Recipe No → Recipe Name linked dropdown remains intact.

## Changes

1. `getConfigHealth()` keeps its existing SQL logic, but now uses Next `unstable_cache` for 60 seconds with tag `config-health`.
2. Configuration sidebar is a Client Component and loads health from `/api/config/health` after the page shell is visible. Child Configuration pages no longer await the heavy health query during SSR.
3. `/settings` overview also loads health asynchronously in the browser. Sidebar and overview share one in-flight request/client cache, so the first HTML is not blocked by health calculation and the same health request is not duplicated.
4. Relevant configuration write APIs call `invalidateConfigHealth()` after a successful commit/write. Client managers broadcast a health-invalidated event so the green/orange indicators refresh without a full browser reload.
5. Added route `loading.tsx` skeletons for Configuration pages.
6. Area, Schedule Area and Planner Assignment initial GETs no longer force `cache: "no-store"`. Their APIs allow a short 30-second browser/CDN cache; writes explicitly reload with a unique `fresh` URL.
7. Most Configuration managers replace `location.reload()` with `router.refresh()` plus health invalidation. ST Operation Flow intentionally keeps its existing full reload because its save/remove path performs derived-chain synchronization and already has dedicated progress/message behavior.
8. Migration `047_config_health_performance_indexes.sql` adds partial/expression indexes for the joins and anti-join used by Config Health. It changes no SQL business conditions.

## Not included in v286

- Materialized `config_health_snapshot` / materialized view.
- Background refresh for `missing_jobs`.
- Server pagination rewrite of large Configuration managers.

Those are intentionally kept as the next stage because they alter data-flow/architecture more substantially. The low-risk changes above remove the health query from the page critical path first.

## Deploy

Run migration:

`supabase/migrations/047_config_health_performance_indexes.sql`

Then deploy the application normally.
