-- v309 - Manual Intermediate Bridge Segments
--
-- AUTO_ROUTING remains the default source discovered from standardized routing.
-- MANUAL segments are an explicit override for exceptional physical flows.
-- Runtime priority is MANUAL > AUTO_ROUTING; within MANUAL, higher priority wins.
-- Auto rebuild/finalize must never delete or deactivate MANUAL rows.

begin;

alter table public.md_intermediate_bridge_segment
  add column if not exists priority integer not null default 100,
  add column if not exists note text;

create index if not exists ix_intermediate_bridge_segment_source_active_priority
  on public.md_intermediate_bridge_segment(source,is_active,priority desc,id)
  where is_active=true;

-- Old migrations may have retired MANUAL rows by setting is_active=false.
-- Do not reactivate them automatically: explicit user action is required.

commit;
