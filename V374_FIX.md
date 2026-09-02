# V374 — Filtered Process Requirement Import

## Problem
`md_process_requirement` had grown to hundreds of MB because every non-empty Process Requirement column was stored for every Part + Revision, even when no active Recipe Rule used that requirement.

## New canonical logic
`Required Process Requirement Codes = active MD:REQ Recipe Rule codes + Manual Keep codes`.

Master Import now scans all Part/Revision rows but only writes a Process Requirement when:
1. its code is in the required set; and
2. the source value is non-blank.

Requirement extraction runs even when the Part/Revision source hash is UNCHANGED, so after a controlled TRUNCATE the same Master Excel can repopulate only the required rows without forcing unrelated Master data to be rewritten.

## Configuration
New workspace: `Process Requirement Import Filter`.
- Shows all 38 supported Master requirement columns.
- Shows which codes are used by active Recipe Rules.
- Allows optional Manual Keep.
- Shows the effective import set.
- Includes a separately confirmed TRUNCATE action for the Process Requirement table only.

## Runtime protection
Planning Chain no longer reads all active Process Requirement rows blindly. It first derives the MD:REQ codes used by active Recipe Rules and queries only those codes.

## Cleanup procedure
1. Run migration `069_process_requirement_filtered_import.sql`.
2. Deploy V374.
3. Review/configure Manual Keep codes.
4. In the new workspace, type `TRUNCATE` and clear `md_process_requirement` only.
5. Re-import the same Master Excel.

No Planning, Batch, Scheduling or Production Execution state is deleted by this cleanup.
