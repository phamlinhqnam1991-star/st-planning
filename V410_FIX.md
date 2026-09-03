# V410 — Build isolation for stale nested version source

## Problem
V409 delivery accidentally contained a nested `st_v407/` source tree. `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, so TypeScript type-checked that obsolete tree and reported missing modules/types from V407 even though the current `src/` compiled.

## Fix
- Removed nested `st_v407/` from delivery.
- Added `st_v*/**` and `work_v*/**` to `tsconfig.json` exclude.
- `npm run build` now runs `npm run clean:stale` before `next build`.
- `scripts/remove-stale-legacy.mjs` and platform helper scripts remove top-level stale `st_v###` / `work_v###` directories as well as the existing orphan-file manifest and build caches.

No business logic, Dashboard calculation, Planning Chain, Recipe, Batch or Schedule logic changed.
