# ST Operation Flow v179

## 1. Source of truth

| Layer | Table | Responsibility |
|---|---|---|
| Raw source operation | `md_operation` | Catalog of operation codes from factory/master data. Not ST-specific. |
| ST membership/type | `md_st_operation_scope` | Decides whether a raw operation belongs to ST and whether it is `PLANNING_OPERATION` or `ST_SCOPE_ONLY`. |
| Source → Main | `md_st_operation_mapping` | Converts ST raw operation into Planning Main Operation. |
| Main Operation | `md_operation_master` | Main process properties, batch prefix, time configuration, group. |
| Planning Main scope | `md_planning_operation_scope` | Dynamic list/order of Main Operations used by Planning Board/Planning Chain. |
| ST Group | `md_st_group` | Logical process group. |
| Physical Area | `md_area_operation_group` + `md_area` | One ST Group → physical production area. |
| Schedule Area | `md_schedule_area_operation` + `md_schedule_area` | Main Operation → scheduling lane/resource area. |
| Planner owner | `md_planner_work_assignment` | Schedule Area → Planner 1/2. |
| Derived route | `md_st_routing*` | Rebuilt from Routing Detail + current ST Scope. |
| Job planning chain | `planning_job_operation` | Future/current Main Operations for each Open Job. |

## 2. One-step add/update sequence

When `PLANNING_OPERATION` is saved on `/st-operation-flow`:

1. Upsert `md_operation`.
2. Activate `md_st_operation_scope`.
3. Ensure `md_st_group`.
4. Upsert `md_operation_master`.
5. Upsert `md_planning_operation_scope`.
6. Deactivate previous active Source mapping and activate the selected Source → Main mapping.
7. Set ST Group → Physical Area.
8. Set Main Operation → Schedule Area.
9. Optionally set Schedule Area → Planner Owner.
10. Rebuild all derived ST Routing from `md_routing_detailed` using the current ST Scope.
11. Run `refresh_st_operation_mapping(null)`.
12. Run `syncPlanningChains()` using dynamic Main Planning scope.
13. Commit the transaction.

Existing actual Batch/Schedule history is not deleted.

### ST_SCOPE_ONLY save sequence

1. Upsert `md_operation` (Operation Code/Name and optional Planning Order).
2. Activate `md_st_operation_scope` with `operation_type='ST_SCOPE_ONLY'`.
3. Deactivate any old Source → Main mapping for that exact Source Operation.
4. Deactivate its active `planning_job_operation` rows; Batch/Schedule history remains untouched.
5. Rebuild derived ST Routing and synchronize Planning Chains.

`Main Operation`, `Main Planning Order`, `ST Group`, `Physical Area`, `Schedule Area` and `Planner Owner` are optional and may remain completely blank for `ST_SCOPE_ONLY`.

## 3. All Open Jobs rule

The ST All Open Jobs page is filtered by:

`open_job_current.next_operation ∈ active md_st_operation_scope`

It is **not** filtered by `md_st_operation_mapping`.

Therefore an active `ST_SCOPE_ONLY` Operation remains visible in All Open Jobs when it is `NextOperation`, even without any Source → Main Mapping. It is a valid configuration state, not `MISSING_MAIN_MAPPING`.

## 4. Planning Board rule

- Candidate Planning Chain is built only from active Source → Main Mapping whose Source is active `PLANNING_OPERATION`.
- Valid Main Operations come dynamically from `md_planning_operation_scope`; no hard-coded Main list remains.
- RAW NextOperation sort uses ST Scope Operation Order.
- Current Main UX remains independent from whichever Main matrix column is first.
- PIONBL remains skipped when its Planning Scope row is inactive.
- `ST_SCOPE_ONLY` never creates or remains as an active Planning candidate, including after a chain rebuild.

## 5. Board Điều Độ rule

- Main Operation → Schedule Area comes from `md_schedule_area_operation`.
- Planner ownership comes from `md_planner_work_assignment` through Schedule Area.
- Runtime no longer uses the old hard-coded Planner 1/Planner 2 operation arrays.
- Cross-planner handover uses the same database mapping.
- `ST_SCOPE_ONLY` has no Schedule Area/Planner requirement and never creates a scheduling lane item.

## 6. Safe remove

Removing a Source Operation from ST:

- sets `md_st_operation_scope.is_active=false`;
- deactivates its active ST Source mapping;
- keeps `md_operation` intact because the same raw operation may still be used by other factory areas;
- rebuilds derived ST Routing and future Planning Chain;
- preserves historical Batch/Schedule data.

## 7. Configuration screens

- **ST Operation Flow**: primary screen for all new Operation setup.
- **Main Operation Master**: advanced process properties/time/batch prefix.
- **ST Scope & Operation Order**: membership + raw NextOperation production order.
- **Source → Main Mapping**: advanced mapping-rule maintenance.
- **ST Group Master**: group catalog.
- **Physical Area Master**: group → physical area.
- **Schedule Area Mapping**: Main → schedule lane/resources.
- **Phân chia Planner**: schedule area → planner.
