# V532 — Operation Inbox runtime/server fix

## Fixed
- `/unconfigured-operations` no longer fails the whole Next.js Server Component when one optional configuration query fails.
- Replaced the single large Operation Inbox SQL with schema-tolerant loading:
  - read open `open_job_current` rows;
  - parse `AllOperation` with the same canonical pipe splitter used by Planning Chain;
  - aggregate unique Operation Codes in application memory;
  - load ST Scope, Mapping, Intermediate Bridge, Operation Name and NOT_ST review independently.
- Optional editor datasets (Main Operation / ST Group / Physical Area / Schedule Area / Planner) now fall back independently instead of blanking the whole page.
- Schedule Area falls back to `md_schedule_area.planner_owner` if `md_planner_work_assignment` is unavailable.
- Removed the unused `batch_prefix` dependency from the page query.
- Added an in-page diagnostic panel so a future DB/schema issue shows the actual server data error instead of only Vercel's generic `This page couldn't load` screen.

## Business logic unchanged
- Inbox still scans `NextOperation + AllOperation`.
- Fully configured active `PLANNING_OPERATION / INTERMEDIATE / ST_SCOPE_ONLY` are excluded.
- Active Planning Operation without Mapping remains `PARTIAL_CONFIG`.
- Explicit `NOT_ST` remains ignored/reviewed state.
- Add to ST / Not ST action behavior is unchanged.
- ST Output / ST Final Steps / Planning Chain / Batch / Scheduling are unchanged.
