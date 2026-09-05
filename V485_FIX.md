# V485 · Re-scan removes stale pending Daily Adjustment items

## Problem
First scan could create Carry Over / Remove Job because Production had not reported DONE. If Production later corrected the report to DONE and Scan was run again, the old PENDING adjustment remained visible.

## Fix
`scanProductionAdjustments()` now treats every scan as the latest reconciliation snapshot:
- rebuild current valid Carry Over / Remove Job findings;
- preserve valid PENDING rows;
- delete only stale **PENDING** auto-scan findings;
- preserve APPROVED / REJECTED rows and ADD_JOB audit history.

No SQL migration. Business rules outside Daily Production Adjustment are unchanged. Logic Guide and Training were updated in parallel.
