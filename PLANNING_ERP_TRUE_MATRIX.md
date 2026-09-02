# Planning ERP True Matrix

## Routes
- `/planning`: ERP Matrix presentation.
- `/planning-old`: baseline presentation for regression comparison.

## Architecture
The two routes keep the same Candidate loading, Route Matrix status calculation,
Recipe/Batch Compatibility, selection and Batch mutation logic.

`/planning` passes `presentation="erp"` to the shared PlanningCandidateShell and
PlanningBoardClient. The ERP presentation has its own column preferences and CSS,
so changing the new Matrix layout does not overwrite the baseline UI settings.

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

Do not remove `/planning-old` until functional regression has been approved.
