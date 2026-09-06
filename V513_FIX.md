# V513 · Masking Time Estimate Config fail-safe

## Scope
Only fixes `/masking-time-estimate-config` stability. No change to Masking Estimate business logic, Planning Chain, READY/WAIT, Batch, Schedule, Production, Chat, or Realtime.

## Fix
- Removed `Promise.all()` all-or-nothing loading from the Masking Time Estimate config Server Component.
- V512 schema readiness now checks all three Masking configuration tables, not only the mapping table.
- Physical Area, Main Operation, Open Job Column Values, manpower allocation, and mapping data are loaded independently.
- A missing table/column/query now renders an in-page diagnostic instead of throwing the whole page.
- Older DBs without `planning_sort_order` fall back to alphabetical Main Operation loading.
- Database connection/read failure also fails open and preserves the page shell.
- No new SQL migration is required for V513. Use the existing four-query V512 migration if schema is incomplete.
