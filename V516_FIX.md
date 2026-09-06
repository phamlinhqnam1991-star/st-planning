# V516 · Masking Config HTTP 503 / single-connection fix

## Scope
Fix only `/masking-time-estimate-config` when the client island reports `Masking Config API HTTP 503` after one or more successful saves. No Masking Estimate business-rule change.

## Root cause addressed
- The Masking Config API performed RBAC authorization through `getAccessContext()`, which checked out a PostgreSQL client, then the same request checked out another client for config reads/writes.
- With Aiven/Vercel `DB_POOL_MAX=1` and concurrent realtime/header activity, this extra checkout can time out and return HTTP 503 even though the four V512 tables already exist and the previous save committed.
- The client initialized `migrationReady=false`, so any API 503 was incorrectly displayed as “Schema Masking Estimate chưa đầy đủ.”
- A successful local save could also trigger both the explicit reload and its own realtime echo, producing two nearly simultaneous GET reloads.

## Fix
- Added `getAccessContextWithClient()` and `requireApiPermissionWithClient()` so Masking Config reuses one caller-owned DB client for authorization + data/mutation work.
- RBAC side reads are sequential on the same client, friendly to `DB_POOL_MAX=1`.
- `migrationReady` is tri-state: `true` = schema ready, `false` = schema genuinely missing, `null` = API/schema state temporarily unknown. HTTP 503 no longer pretends the four queries are missing.
- Client diagnostics show API/DB unavailable separately and retry 503 with gentle exponential backoff.
- A local save suppresses its own synchronous realtime echo and performs one config reload only; remote tabs still react normally.
- No SQL/migration required. Existing V512 four-query schema remains canonical.

## Unchanged
Masking Estimate formula, manpower values already saved, Main -> Masking column mapping, READY/WAIT, Planning Chain, Batch, Scheduling, Production, Internal Chat and Global Realtime transport.
