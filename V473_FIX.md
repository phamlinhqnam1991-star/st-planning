# V473 — Area Display Order + Preparation split + READY previous DONE

## Scope
Only the requested display/workload logic was changed. No database migration and no unrelated Planning/Batch/Recipe/Scheduling/Production logic was changed.

## 1. Configuration — Area Display Order
- New Configuration page: `/area-display-order`.
- Uses existing `md_area.sort_order`; no new table/column.
- Planner can move active Physical Areas up/down and save one canonical display order.
- Board Điều Độ uses Physical Area order first, then Main Planning Order, then Schedule Area display_order.
- Dashboard/Planning workload already consume `md_area.sort_order`; Production report Area panels now also use it.

## 2. Production Report — Masking/Unmasking Preparation split
- V455 physical-area ownership remains.
- V473 supersedes the presentation grouping: support work is now grouped by **Physical Area + linked Main**.
- Painting preparation therefore shows separate panels for PRIMER, PRIMER2, PRIMER3, TOPCOAT1, TOPCOAT2, ANTI-ABRASION (and any other linked Main as its own panel).
- Unmasking → Masking step order and execution identity/status are unchanged.

## 3. READY split — Previous Main DONE without Batch
- Planning workload and Dashboard/Scheduling workload use the same handoff rule.
- `READY_PREV_SCHEDULED` now means Previous Main is either:
  1. scheduled, or
  2. already physically DONE/passed even if legacy history has no Batch.
- `READY_PREV_UNSCHEDULED` remains plan-ahead READY where Previous Main is not yet handed off, plus first Main/START.
- Sequential READY itself is not changed.

## 4. Documentation
- Logic & Hướng dẫn updated.
- Training updated in parallel, including a test case for Previous Main DONE without Batch.
- README_HUONG_DAN_CHI_TIET updated.
