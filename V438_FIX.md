# V438 — Supabase PostgreSQL → Aiven PostgreSQL

- Canonical operational database is now Aiven PostgreSQL via `DATABASE_URL`.
- Removed Supabase/Supavisor-specific runtime DNS, direct-host and pooler selection from `src/lib/db.ts`.
- `DB_POOL_MAX` defaults to 1 for Aiven Free connection budget.
- Converted remaining Supabase REST database reads/writes in Part Tracker, generic Master Data, dashboard stats and Master Import batch status to standard PostgreSQL `pg`.
- Supabase admin client remains only for Storage during the migration phase; existing Auth code is not removed.
- First migration is FULL public schema + FULL public data (~600 MB). No history/index cleanup is performed before successful Aiven cutover.
- Updated provider-neutral backup/restore env names.
- No Planning Chain, Candidate, Recipe, Batch, Schedule, Chemical Line, Masking/Unmasking, Production or Dashboard business rule changes.
