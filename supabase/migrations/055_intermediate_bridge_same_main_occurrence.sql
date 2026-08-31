-- v307 - Intermediate Bridge: allow repeated Main Planning names across occurrences
--
-- A valid standardized route can contain the same Main Planning operation more
-- than once. Example:
--   CPBILP#1 -> [INTERMEDIATE...] -> CPBILP#2
-- The two ends are different route occurrences (different seq) even though the
-- normalized Main name is identical. The original v296 check constraint only
-- compared names and incorrectly blocked this valid bridge at Finalize.
--
-- Occurrence integrity is guarded by md_intermediate_bridge_route's
-- previous_main_seq / next_main_seq evidence and by the v307 Finalize validation.

begin;

alter table public.md_intermediate_bridge_segment
  drop constraint if exists md_intermediate_bridge_segment_prev_next_check;

-- Keep the useful part of the old constraint: both endpoint names must exist.
alter table public.md_intermediate_bridge_segment
  drop constraint if exists md_intermediate_bridge_segment_main_not_blank_check;

alter table public.md_intermediate_bridge_segment
  add constraint md_intermediate_bridge_segment_main_not_blank_check
  check (
    nullif(trim(previous_main_operation),'') is not null
    and nullif(trim(next_main_operation),'') is not null
  );

-- Route evidence must always move forward in the standardized routing chain.
-- NOT VALID makes the migration safe on an existing database; new/updated rows
-- are checked immediately, while old rows can be validated separately later.
alter table public.md_intermediate_bridge_route
  drop constraint if exists md_intermediate_bridge_route_seq_order_check;

alter table public.md_intermediate_bridge_route
  add constraint md_intermediate_bridge_route_seq_order_check
  check (
    previous_main_seq is null
    or next_main_seq is null
    or previous_main_seq < next_main_seq
  ) not valid;

commit;
