# V390 — Planning Board instant mutation sync

- Job/Main Hold and Unhold no longer trigger a full Candidate reload.
- After the Hold API commits, the visible Job/Main cell is patched immediately to `HOLD`; Unhold immediately returns the visible occurrence toward READY/WAIT from the returned planning state.
- A canonical `/api/planning/candidates/delta` refresh then reloads only the affected Job and refreshes only that Job's Route Matrix.
- Create/Add Batch continues to use the same affected-Job delta path; no page reload or board remount is used.
- Full Candidate loads now clear the Route Matrix cache first, preventing stale pre-mutation statuses from surviving a manual Apply/refresh.
- Planning Board no longer contains a `location.reload()` fallback when saving the Operation View.
- Batch creation and Planning Chain rebuild now validate `response.ok` before showing a success message.
- Scroll position, filters, zoom, density, column layout and current board component remain mounted during normal Batch/Hold saves.
- No database migration and no Planning/Batch/Schedule business-rule change.
