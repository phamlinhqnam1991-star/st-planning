# V383 — Local PostgreSQL Database Backup / Restore

- Added `npm run db:backup` using `pg_dump` custom compressed format.
- Added `npm run db:restore -- <file.dump> --confirm=RESTORE` using `pg_restore`.
- Added Windows one-click wrappers in `scripts/backup-database.cmd` and `scripts/restore-database.cmd`.
- Backup is limited to application schema `public`; Supabase-managed schemas are excluded.
- Backup runs locally/admin-side, not through Vercel, to avoid serverless timeout/memory/response limits on a large database.
- Transaction Pooler `:6543` is automatically converted to Session Pooler `:5432` when a dedicated backup URL is not supplied.
- Added backup manifest with SHA-256 checksum and masked source URL.
- Added `.gitignore` protection for backup files.
- No Planning / Batch / Recipe / Schedule / Production logic changed.
