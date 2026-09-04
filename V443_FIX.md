# V443 — Planning Candidate TypeScript build fix

- Fix TS7006 in `src/lib/planning/candidate-data.ts` introduced by the V442 single-connection Aiven path.
- Explicitly type the two `query(...).then(...)` callback results used by Recipe Options and Time Rules.
- No SQL, Planning Chain, READY/WAIT, Batch, Schedule, Chemical Line, Recipe, Dashboard, Masking/Unmasking or Production logic changes.
