# V514 · Masking Config client-island stability

## Scope
Only fixes `/masking-time-estimate-config` stability after adding/saving multiple Physical Areas or mappings. No Masking Estimate business-rule change.

## Root cause addressed
- The config page performed DB reads in the Server Component.
- A save called full `router.refresh()`.
- Global Realtime did not recognize `/masking-time-estimate-config`, so the same CONFIG mutation could trigger another RSC refresh.
- Repeated saves could therefore create overlapping RSC/DB reloads and end in `This page couldn't load`.

## Fix
- Server page is now a stable shell with no Masking DB reads.
- Added fail-safe GET on `/api/config/masking-time-estimate`.
- Client manager loads/reloads only Masking config data.
- Saves no longer call `router.refresh()`.
- Realtime recognizes the Masking config route and the manager reloads only its own dataset on CONFIG/SCHEDULE events.
- Masking config mutations no longer invalidate the expensive global Config Health query because these advisory tables are not part of that health calculation.
- Individual source failures appear in in-page diagnostics.
- Main mapping validation queries are sequential on the same DB client, friendly to `DB_POOL_MAX=1`.
- No new SQL migration. Existing V512 four-query schema remains canonical.
