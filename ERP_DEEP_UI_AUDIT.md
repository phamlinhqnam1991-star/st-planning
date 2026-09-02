# ERP Deep UI Audit

Phạm vi: presentation/UI only. Không thay đổi business logic, API contract, database schema, Planning/Batch/Recipe/Schedule engine.

## Shared ERP layer
- Sticky masthead + module navigation.
- Sticky configuration/master sidebar.
- Segoe UI Variable/Segoe UI typography và tabular numeric.
- Object-page hierarchy cho title/description/action.
- Command/form controls thống nhất focus/hover/disabled.
- Panel/card hierarchy, section header accent.
- Data-grid compact với sticky table header, numeric alignment và scrollbar đồng bộ.
- Status/notice/empty state thống nhất.
- Responsive: desktop data-density first, mobile module short code.

## Tab coverage
- Master Data: overview KPI + master grid + sticky sub-navigation.
- Configuration: navigation rail, dependency flow, wizard, recipe/time rules, auto planning rules.
- Part Tracker: command-search + object summary + revision/detail sections.
- Job Tracker: command-search + lifecycle/object detail + Planning/Batch/Schedule tables.
- All Open Jobs: sticky status segmentation + command search + dense current snapshot grid + import history.
- Planning Board: giữ ERP Matrix/Focus Mode hiện tại; không thay logic.
- Masking / Unmasking: date/filter workspace + summary metrics + grouped Main Operation panels.
- Board Điều Độ: planner KPI + planner switch + unscheduled workspace + direct grids + schedule tables + timeline.
- Import Master: import metrics + file-import workspace + history grid.
- Logic & Hướng dẫn: sticky jump navigation + rule/guide cards.
- Login: ERP identity + focused authentication card.

## Validation
- Local TypeScript/TSX syntax parse: 181 files, 0 syntax diagnostics.
- Local import resolution: 0 missing imports.
- CSS brace balance: OK.
- Full npm production build was not completed in the audit container because dependency installation timed out.
