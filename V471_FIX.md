# V471 - Fix ERP All Tabs Demo Training build error

- Fix TypeScript TS2741 in `src/components/erp/erp-all-tabs-demo.tsx`.
- `MainTab` already contained `training`, but `screen: Record<MainTab, ReactNode>` did not provide a `training` entry.
- Added `TrainingDemo()` and mapped `training: <TrainingDemo />`.
- No business logic, API, database, scheduling, production, batch, or migration changes.
