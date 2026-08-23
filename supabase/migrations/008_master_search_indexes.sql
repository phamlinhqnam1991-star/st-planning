-- Master Data search performance v15
-- Optimizes exact PartNum lookups used by large Master Data tables.

create index if not exists ix_part_revision_part_active
  on public.md_part_revision(part_num, is_active, revision_num);

create index if not exists ix_routing_detailed_part_active_seq
  on public.md_routing_detailed(part_num, is_active, revision_num, source_seq);

create index if not exists ix_material_finish_part_active_rev
  on public.md_material_finish(part_num, is_active, revision_num);

create index if not exists ix_process_requirement_part_active_rev
  on public.md_process_requirement(part_num, is_active, revision_num, requirement_code);

create index if not exists ix_part_routing_part_active_rev
  on public.md_part_routing(part_num, is_active, revision_num);

analyze public.md_part_revision;
analyze public.md_routing_detailed;
analyze public.md_material_finish;
analyze public.md_process_requirement;
analyze public.md_part_routing;
