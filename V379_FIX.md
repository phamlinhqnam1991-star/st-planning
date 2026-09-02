# V379 Fix — Planning Board restore-all after READY deselect

## Symptom
On ERP Planning Board, selecting a READY cell activates Batch Selection Mode and narrows the table to the selected Main Operation. After clearing the selection, the full Candidate set returns but progressive DOM rendering could stop at the current chunk (usually 100 rows), so not all Jobs became visible while scrolling.

## Root cause
The IntersectionObserver was bound to `displayCandidates.length`, while the rendered table/sentinel is driven by `batchScopedDisplayCandidates`. Batch Selection could remove the sentinel without changing `displayCandidates.length`; when selection was cleared, the sentinel returned but the observer effect did not re-run.

The observer also used the browser viewport as root even though Candidate Jobs scroll inside `.table-wrap`.

## Fix
- Progressive rendering now follows `batchScopedDisplayCandidates` — the actual rendered scope.
- Observer rebinds when Batch Selection scope changes (`ALL` ↔ selected Main Operation).
- Observer root is the Candidate `.table-wrap` scroll container.
- Route Matrix lazy loading now follows `batchScopedRenderedCandidates`, so restored rows request their statuses immediately after deselect.

## Scope
Presentation/loading fix only. No change to Planning Chain, READY/WAIT rules, Batch, Recipe, Schedule, Production Execution, database schema, or business logic.
