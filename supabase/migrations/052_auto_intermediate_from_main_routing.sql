-- v297 - Intermediate is fully inferred from Main Planning + ST Routing Chain
--
-- Manual INTERMEDIATE classification from v295/v296 is retired. Runtime now
-- infers bridge membership from md_st_routing ordered by routing_code + seq:
-- consecutive Main Planning rows define a segment, and every non-Main raw
-- operation between them is Intermediate except PIONBL / explicit ST_SCOPE_ONLY.

begin;

-- Legacy manual rows are no longer a source of truth. Keep the records for
-- audit/history but deactivate them so they cannot override AUTO inference.
update public.md_st_operation_mapping m
set is_active=false,
    updated_at=now()
from public.md_st_operation_scope s
where s.is_active=true
  and s.operation_type='INTERMEDIATE'
  and upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
  and m.is_active=true;

update public.planning_job_operation p
set is_active=false,
    updated_at=now()
from public.md_st_operation_scope s
where s.is_active=true
  and s.operation_type='INTERMEDIATE'
  and upper(trim(s.operation_code))=upper(trim(p.source_operation_code))
  and p.is_active=true;

update public.md_st_operation_scope
set is_active=false,
    updated_at=now()
where is_active=true
  and operation_type='INTERMEDIATE';

-- Manual bridge variants are retired as well. AUTO_ROUTING is the single source.
update public.md_intermediate_bridge_segment
set is_active=false,
    updated_at=now()
where is_active=true
  and source='MANUAL';

-- Fast lookup when NextOperation is an automatically inferred Intermediate.
create index if not exists ix_intermediate_bridge_operation_code_active
  on public.md_intermediate_bridge_operation(upper(trim(operation_code)),segment_id);

create index if not exists ix_intermediate_bridge_segment_active_pair
  on public.md_intermediate_bridge_segment(
    upper(trim(previous_main_operation)),
    upper(trim(next_main_operation)),
    route_count desc,
    id
  ) where is_active=true;

-- Helps rebuild the standardized routing span between Main Planning occurrences.
create index if not exists ix_routing_detailed_part_rev_seq_active
  on public.md_routing_detailed(part_num,revision_num,source_seq)
  where is_active=true;

commit;
