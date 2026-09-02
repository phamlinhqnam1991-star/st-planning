# Planning ERP True Matrix

## Routes
- `/planning`: ERP Matrix presentation.

## Architecture
The ERP Planning route keeps the existing Candidate loading, Route Matrix status calculation,
Recipe/Batch Compatibility, selection and Batch mutation logic.

`/planning` passes `presentation="erp"` to the shared PlanningCandidateShell and
PlanningBoardClient. The ERP presentation has its own column preferences and CSS while reusing the canonical Planning business logic.

## ERP default view
The ERP Matrix starts with only:
- Job
- Part / Rev
- Qty
- Surface
- Priority
- Dynamic Main Operation columns

All advanced columns, filters, sort rules, Recipe check, freeze, rebuild and Batch
functions remain available from the ERP toolbar.
