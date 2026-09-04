# V442 — Planning Board Aiven one-connection pool fix

## Symptom
After database cutover to Aiven, `/planning` could fail with the generic Next.js server error while `/api/system/db-info` confirmed Aiven was connected.

## Root cause
Aiven Free runtime was deliberately configured with `DB_POOL_MAX=1`. The Planning page and Candidate loader still contained legacy parallel-read paths that acquired a second client from the same pool while the request already held the only client. This produced a circular wait / connection timeout.

## Fix
- Planning static/cache data is resolved before the page reserves its live DB client.
- Initial Planning metadata reuses the page client.
- Candidate loader reuses its existing client when `DB_POOL_MAX=1`; the old two-client parallel path remains available only when the pool is explicitly configured above one.
- No Planning Chain, Candidate population, Recipe, Batch, Schedule, Dashboard, Chemical Line, Masking/Unmasking, or Production business rule is changed.
