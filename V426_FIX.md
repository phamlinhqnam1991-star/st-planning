# V426 — READY handoff split + full-width Dashboard chart + Schedule Area ST workload

## 1. Planning Board Workload Summary

V425 Candidate membership remains the source of truth:

`Open Job -> live Current Main -> RAW NextOperation in resolved Planning ST View -> Candidate Job -> active Planning Chain`

READY is presentation-split by the immediate Previous Main:

- `READY · Previous Main Scheduled`: Previous Main has a live non-cancelled Schedule with Planned Start.
- `READY · Previous Main Unscheduled / START`: Previous Main has no live Schedule, or this is the first Main and there is no Previous Main.

The two sub-buckets always sum to the original READY metric. WAIT/HOLD and Candidate/Route Matrix population are unchanged. Clicking either READY sub-bucket still drills to the exact Main/READY population and additionally filters the client Route Matrix by the Previous Main scheduling context.

This split is read-only and does not change Sequential READY gating. Batch UNSCHEDULED is still sufficient handoff for the next Main exactly as before.

## 2. Dashboard combo chart

`Surface + Qty by Main Planning / Immediate Operation / ST Only` keeps Surface max 50,000 dm², Qty max 10,000 pcs and separate TOTAL zone. The SVG logical width is increased from 1200 to 1560 and the max-height width constraint is removed so the chart consumes the full Dashboard panel width instead of leaving unused white space.

No chart population/formula changes.

## 3. Scheduling Board — ST Workload Summary · By Area

Each top-level Schedule Area now shows a compact Main -> Recipe workload table above its Unscheduled/Schedule grid.

Source of truth is the existing canonical Dashboard workload engine (`loadStDashboardData`). Scheduling does not calculate a second workload population. The Board only filters Dashboard Main rows by the Schedule Area's mapped Main Operation set.

Shown buckets:
- WAIT
- READY
- PLANNED-UNSCHEDULED
- SCHEDULED
- HOLD
- Total

For grouped areas such as Painting with multiple cabin lanes, one summary is shown for the pooled Main Operations of the group; child lanes do not duplicate the same workload table.

The summary refreshes after Scheduling changes through the existing `st-schedule-changed` event and on page load.

## Scope

No changes to Current Main resolver, Planning Chain / Sequential READY, Candidate membership, Batch / Recipe logic, Schedule conflict rules, Dashboard ST Scope membership, INTERMEDIATE Dashboard-only behavior or Production Execution. No database migration required.
