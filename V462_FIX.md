# V462 — Recipe-specific Batch Size

## Logic đã chốt

Batch No format remains configured per Main Operation: Prefix + Sequence Start + Padding.

Batch Size now resolves in this order:

1. Exact Main Operation + Recipe override in `md_operation_recipe_batch_size`.
2. COMMON Batch Size from `md_operation_master.batch_size_qty` when no exact Recipe override exists.
3. If neither exists, no split is applied for that Recipe; selected Qty stays in one Batch.

`batch_auto_split` remains the Main Operation switch. When OFF, no split is performed even when Batch Size rules exist.

Recipe-specific Batch Size changes only split quantity. Prefix/sequence, Recipe selection, Scheduling, Production Execution and the Planning Board `Batch1 & Batch2` display architecture are unchanged.
