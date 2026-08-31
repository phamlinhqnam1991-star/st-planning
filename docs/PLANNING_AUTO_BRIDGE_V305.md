# v305 — Full Auto Bridge reads all Standardized Routing patterns

## Root cause fixed
Previous Full rebuild only snapshotted routing codes whose `md_st_routing_summary.is_active=true`. That flag represents current Part/Revision usage, not whether a Standardized routing pattern is valid bridge evidence. This could exclude legacy/unused-but-valid routes that contain the Intermediate sequences.

## Canonical Full source

```sql
select distinct routing_code
from md_st_routing
where is_active=true;
```

Each chunk then loads all active rows for those routing codes ordered by `(routing_code, seq)`. No `md_st_routing_summary.is_active` join is used in discovery.

## Segment rule
Within one routing code, consecutive Planning Main occurrences form boundaries. Ordered non-Main `operation_code` rows between them become the Intermediate signature. PIONBL and aliases mapped to PIONBL remain skip-only.

Chunking, resume, staging and atomic finalize remain unchanged.
