# Planning Delta Query Type Fix v337

Fixes TypeScript build error in `src/app/api/planning/candidates/delta/route.ts`:

`Object literal may only specify known properties, and 'jobNums' does not exist in type 'PlanningCandidateQuery'.`

Changes:
- `PlanningCandidateQuery` now uses the explicit optional field `deltaJobNums?: string[]`.
- Delta candidate API passes `deltaJobNums: jobNums`.
- Candidate SQL reads `input.deltaJobNums` and applies `j.job_num = any(...::text[])`.
- No database migration required.
