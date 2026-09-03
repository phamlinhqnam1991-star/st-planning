# V415 · Dashboard chart Total separated

UI-only change requested for `Surface + Qty by Main Planning / Immediate Operation / ST Only`.

- `TOTAL / ALL ST` is no longer appended into the normal operation sequence.
- Main / Immediate / ST Only remain in the normal chart area in their existing order.
- Total is rendered in a dedicated summary zone on the far right with a visual separator.
- The Qty line connects only the normal operation buckets; Total is a standalone point so it does not distort the operation trend.
- Total continues to use exactly the same calculated `total` metric; no aggregation, resolver, ST scope, Planning Chain, Batch, Recipe, Schedule, or Workload Summary logic changed.
- Surface axis remains fixed at 50,000 dm² and Qty axis remains fixed at 10,000 pcs.
