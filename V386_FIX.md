# V386 — Area Main Matrix + Virtual Previous Main

## Scope
Planning Board Candidate Matrix presentation only. No Planning Chain, Recipe, Batch, Scheduling, Production Execution, or database schema change.

## Change
When Candidates are loaded for one Area without a specific Main Operation filter:

`Previous Main | <all Main Operations configured in selected Area>`

- Applies to every Area. Painting is only an example.
- Main columns are sourced from the existing Area -> Main Operation mapping and kept in Main Planning Order.
- Cross-area physical Main columns are hidden in Area focus.
- Previous Main is one virtual read-only column and resolves the immediate upstream Main for the exact Candidate occurrence using `source_seq`.
- Previous Main keeps V384 status/Batch/Schedule/Resource display.
- READY selection behavior from V385 remains unchanged and overrides Area focus with `Previous Main | Selected Main | Next Main Planning`.
