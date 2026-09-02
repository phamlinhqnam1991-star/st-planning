# V375 — Process Requirement Part/Revision Gate

## Goal
Reduce `md_process_requirement` further by excluding entire Part/Revision records that are not relevant to ST before expanding any of the 38 Process Requirement columns.

## Agreed logic
1. Evaluate active Part/Revision Gate Rules directly from the Master Excel row.
2. Default rule seeded by migration 070: `ST = NO`.
3. If any Gate matches, store **zero** Process Requirement rows for that Part/Revision, including the Gate Requirement row itself.
4. If the Part/Revision passes the Gate, keep V374 logic: Active `MD:REQ:*` Recipe Rule OR Manual Keep, and skip blank values.
5. Gate evaluation also runs for UNCHANGED source hashes.
6. Re-import removes existing `md_process_requirement` rows for blocked Part/Revisions.
7. Part, Routing, Planning Chain, Batch, Schedule, Recipe and Production Execution data are not deleted by the Gate.

## Configuration
`Configuration -> Process Requirement Import Filter -> Part / Revision Gate Rules`

Gate Rule fields:
- Requirement Code
- Blocked Values (comma separated, exact match, case-insensitive)
- Enabled
- Note

## Migration
Run:
- `069_process_requirement_filtered_import.sql`
- `070_process_requirement_part_gate.sql`

Migration 070 creates `md_process_requirement_gate_rule` and seeds `ST = NO` without deleting current Requirement data.

## Recommended one-time rebuild
1. Deploy V375.
2. Run migrations 069 and 070.
3. Verify `ST -> NO -> ACTIVE` in Process Requirement Import Filter.
4. Type `TRUNCATE` in the cleanup panel and clear only `md_process_requirement`.
5. Re-import the same Master Excel.
6. Check import result: `Gate bỏ X Part/Rev` and the new Process Requirement row count.
7. Check Supabase Database Size / Large Objects.
