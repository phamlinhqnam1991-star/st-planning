# V382 — Virtual Previous Main + Recipe in active Next Main

## Scope
Planning Matrix presentation only. No Planning Chain, Batch, Recipe resolution, Schedule, Production Execution, or database schema change.

## READY / Batch focus
After the first READY Job establishes the Batch Main:

- Keep Job/source columns as configured.
- Replace the previous multi-column upstream display with one virtual `Previous Main` column.
- Keep one active `Next Main · <Main Operation>` column.
- Hide every other physical Main Planning column until selection is cleared.

## Previous Main virtual cell
Each Job resolves its own immediate Previous Main occurrence from its route position.

The cell shows, when available:
- Previous Main Operation
- Batch No
- status
- scheduled Start/End in `HH:MM DD-MMM`
- Resource

Mixed upstream paths remain compact. Example: 5 PRIMER Jobs handed off from BSASLD and 5 from BSAUNSLD still use one column; each row shows its own previous Main.

Previous Main is context-only and cannot be selected into the new Batch.

## Active Next Main cell
The existing READY / WAIT / Batch Compatibility behavior is unchanged.

When the active target has a resolved Recipe, the same cell also shows `Recipe No · Recipe Name`. If no Recipe applies, no extra Recipe text is rendered.

## Database
No migration required.
