# Mapping file master → PostgreSQL

| File source | PostgreSQL |
|---|---|
| PartNum, PartDescription, Program, PartCluster, Surface (dm2) | md_part |
| PartNum + RevisionNum | md_part_revision |
| OpCode_OP10..OpCode_OP500 | md_routing_detailed + md_operation |
| PRIMER1..Chemicalconv Airbus (finish subset) | md_material_finish |
| 38 process columns | md_process_requirement |
| 125 ST operation baseline | md_st_operation_scope |
| ST signature dedup | md_st_routing_summary |
| ST signature lines | md_st_routing |
| PartNum + RevisionNum → RoutingCode | md_part_routing |

## ST Operation Mapping v2026-08-21

Planning normalization is stored in `md_st_operation_mapping` and standard planning operations in `md_operation_master`.
Raw `md_operation` and `md_routing_detailed` are preserved unchanged for traceability.

Key confirmed rules:
- MANUALSP: `V_M-SPFD`, `ARL-SHPN`, `V_M-SHPN` => `MANUALSP`.
- PRIMER occurrence by routing sequence: 1 => `PRIMER`, 2 => `PRIMER2`, >=3 => `PRIMER3`.
- TOPCOAT occurrence by routing sequence: 1 => `TOPCOAT1`, >=2 => `TOPCOAT2`.
- HE-BAKE is sequence based and falls back to `HE-BAKE` if no special context matches.
- `md_st_routing` keeps raw operation fields and adds `standard_operation`, `planning_group`, `mapping_rule`, `occurrence_no` for later workload assignment and planning-chain logic.
- Time calculation columns live in `md_operation_master`; the mapping migration never overwrites their values.
