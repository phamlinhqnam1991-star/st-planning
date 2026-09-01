# v353 — Live Recipe Cache Invalidation + Exact Rule Diagnosis

- Fix Planning Board stale Recipe after add/edit/delete Operation Code -> Recipe Rule.
- `getCachedLiveRecipeContext()` remains cached for performance, but recipe-rule mutations now invalidate it immediately.
- Generation guard prevents an older in-flight load from repopulating stale data after invalidation.
- Recipe catalog mutations also invalidate live Recipe + Recipe metadata caches.
- Recipe Diagnosis now shows the exact `recipe_mapping_id` and matched Recipe Rule.
- No database migration required after v352/064.
