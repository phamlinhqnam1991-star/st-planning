# V457 — Scheduling READY split + Schedule Area order + Flybar 1:1 continuation

## Scope
Only Scheduling Board presentation/workload and Chemical Line continuation-link behavior changed.

## 1. READY split on Scheduling Board workload
`ST Workload Summary · By Area` now displays two READY columns:
- `READY · Previous Main đã Schedule`
- `READY · Previous Main chưa Schedule`

Classification is based on the exact immediate Previous Main occurrence and its active non-cancelled Schedule. The two sub-buckets sum to the original READY total. Sequential READY/WAIT is unchanged.

## 2. Schedule area/table order
Top-level Schedule Area blocks are ordered by the earliest `Main Planning Order` among the Main Operations mapped to that area. `md_schedule_area.display_order` remains a tie-breaker. Grouped child lanes use the same rule.

## 3. Chemical Flybar continuation is one-to-one
One Previous/Preclean Flybar source may link to only one downstream row.
- duplicate manual draft → draft links are blocked;
- duplicate links to an already-scheduled source are blocked;
- chemical simulation revalidates uniqueness server-side;
- automatic Previous Main continuation does not reuse the same Previous Batch for a second run in the same proposal.

Source and downstream rows use the same link color/badge so the pair is visible immediately. Existing FB resource colors remain unchanged.

## Not changed
Planning Chain, Batch membership, Recipe resolver, READY/WAIT gating, Chemical process-time rules, NDT rules, max Process concurrency, Schedule persistence model, Auto Planning, and Production Execution are unchanged.
