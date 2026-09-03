# V394 Fix — READY Recipe No visible

- Fixed READY cells to display Recipe No from the live route-level `effective_recipe_no` first, with `recipe_no` as fallback.
- This fixes Area Candidate rows where Route Matrix had a resolved live Recipe but `recipe_no` itself was null.
- Recipe No remains a small label under/lower-right of the READY badge.
- No changes to Recipe Lock, Planning Chain, Batch, Schedule, Hold, or database schema.
