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
