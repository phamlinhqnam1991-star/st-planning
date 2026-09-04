# V439 — Aiven TLS compatibility

- Fixes Node `pg` runtime connection to Aiven when Service URI uses `sslmode=require` and Node reports `SELF_SIGNED_CERT_IN_CHAIN`.
- TLS remains enabled. Default behavior mirrors libpq `sslmode=require`; optional `DATABASE_CA_CERT` enables strict CA verification.
- No change to Planning Chain, Candidate, Recipe, Batch, Schedule, Chemical Line, Masking/Unmasking, Production, Dashboard, or Supabase Storage/Auth temporary role.
