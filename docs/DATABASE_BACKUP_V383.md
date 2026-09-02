# Database Backup / Restore — V383

## Purpose

ST Planning now includes an administrator-run PostgreSQL backup/restore workflow for the application business database. It is deliberately executed **outside Vercel** because a large `pg_dump` can exceed serverless request time/response limits and should not consume production web resources.

## Backup scope

Default backup scope is PostgreSQL schema `public`:

- tables and table data;
- primary keys / indexes / constraints;
- views and functions in `public`;
- Planning, Batch, Schedule, Recipe, Routing, Open Job and Production Execution business data.

Supabase-managed schemas such as `auth`, `storage`, `extensions`, `realtime` are not included. They are platform-managed and are intentionally kept outside the ST Planning business backup.

## Create backup

Prerequisite: PostgreSQL client tools (`pg_dump` / `pg_restore`) installed on the administrator PC.

Windows easiest path:

1. Copy the project to the administrator PC.
2. Keep `.env.local` containing the database connection.
3. Double-click `scripts/backup-database.cmd`.

Or terminal:

```bash
npm run db:backup
```

Output:

```text
backups/st-planning_YYYYMMDD_HHMMSS.dump
backups/st-planning_YYYYMMDD_HHMMSS.dump.manifest.json
```

The dump uses PostgreSQL custom format with compression. The manifest stores creation time, size, source host (password masked), pg_dump version and SHA-256 checksum.

## Connection behavior

Preferred variable:

```env
SUPABASE_DB_BACKUP_URL=postgresql://...
```

When it is blank, the script uses `DB_CONNECTION_STRING` or `SUPABASE_DB_URL`. If the runtime URL is a Supabase Transaction Pooler URL on port `6543`, backup automatically switches the same pooler host to Session Pooler port `5432`, which is more appropriate for `pg_dump`.

## Restore

Restore is intentionally protected by an explicit confirmation token.

```bash
npm run db:restore -- backups/st-planning_YYYYMMDD_HHMMSS.dump --confirm=RESTORE
```

Windows can also drag a `.dump` file onto `scripts/restore-database.cmd` and type `RESTORE`.

Prefer setting a dedicated restore target:

```env
SUPABASE_DB_RESTORE_URL=postgresql://...
```

Restore runs `pg_restore --clean --if-exists` for schema `public`; therefore it replaces existing matching application objects/data. Test restore to a separate Supabase project first whenever possible.

## Operational rule

Backup/restore does not change Planning logic. It is an administrative safety layer only. Never commit `.dump` files or their manifests to Git. Store backups outside the project folder (company OneDrive/SharePoint, encrypted external storage, or another controlled backup location).
