# V392 — READY Recipe No. micro-label

## Scope
Planning Board / Planning Matrix display only.

## Change
- READY cells keep the existing `R` status badge.
- When the READY occurrence has `recipe_no`, the Recipe No. is shown as a small label in the lower-right corner of the same cell.
- Only Recipe No. is rendered; Recipe Name remains in the existing tooltip/context and recipe compatibility logic is unchanged.
- READY cells without Recipe No. render exactly as before.

## Unchanged
Planning Chain, READY/WAIT calculation, Recipe resolution, Recipe Compatibility Lock, Batch, Schedule, Hold, Area scope, Previous/Next Main logic and database schema are unchanged.
