# V441 — Runtime DB identity endpoint

- Added `GET /api/system/db-info`.
- Uses the same canonical `DATABASE_URL` + `pg` runtime as ST Planning.
- Returns `AIVEN`, `SUPABASE`, `NEON`, or generic `POSTGRESQL` based on the actual configured DB host.
- Returns current database/user/PostgreSQL version/server address/latency for deployment diagnostics.
- Never returns `DATABASE_URL`, passwords, API keys, or other secrets.
- `Cache-Control: no-store` and `force-dynamic` ensure every check reflects the current runtime connection.
- No business logic changes.
