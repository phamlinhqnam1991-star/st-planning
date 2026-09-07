# V530 Fix — stale ST_OPERATION_MAPPING import

## Fixed
- Removed stale imports of `ST_OPERATION_MAPPING` from `@/data/master-config`.
- `master-config.ts` no longer exports that legacy tuple table; active `md_st_operation_mapping` in DB remains the canonical mapping source.
- Operation Inbox keeps the same V529 review/add-to-ST logic; only the invalid static suggestion fallback was removed.
- Also removed the same latent stale fallback in `missing-config-jobs.ts` so the next build path does not fail on the identical export error.

## Not changed
- ST Output / ST Final Steps logic.
- Planning Chain / Batch / Scheduling.
- Operation Inbox decisions and persistence.
