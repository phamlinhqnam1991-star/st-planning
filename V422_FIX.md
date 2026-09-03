# V422 · Remove Dashboard Calculation Audit table

- Removed `Dashboard Calculation Audit · Job Detail` from the Dashboard UI.
- Removed the unused `StDashboardAuditJob` type and `auditJobs` population/sort/return path from `dashboard-st-workload.ts`.
- Removed audit-table-only CSS.
- Kept the canonical Dashboard ST population unchanged for KPI cards, both charts, Area/Main/Recipe tables, CAT3 and CAT5.
- No change to Planning Chain, Candidate, Batch, Recipe, Schedule, Workload Summary, Dashboard ST Scope, or Intermediate classification logic.
