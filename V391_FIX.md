# V391 — Logic & Guide live database tables

## Scope
Only the `/logic-guide` live mapping reader was changed. Planning, Recipe, Batch, Schedule, Production Execution and configuration write logic are unchanged.

## Problem
The live Mapping section used one `Promise.all` of raw database queries and assigned results only after every query succeeded. If one optional/newer table or column was missing, a single query rejection skipped all assignments, so every live table appeared empty (`Chưa đọc được...`) even though most database tables were healthy.

## Fix
- Each of the 12 live database reads is isolated with `readLive(key, sql)`.
- A failed query returns an empty result only for that section and records its own error.
- Successful queries still render immediately from the production database.
- The Live DB header reports how many of the 12 groups were read successfully.
- Empty rows distinguish a genuine empty table from a query error and show the database error at the affected table.
- `force-dynamic` remains enabled, so opening/refreshing `/logic-guide` reads the current database state instead of sample/static mapping data.

## No migration
No database migration is required.
