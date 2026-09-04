# V440 — Build type fix for provider-neutral DB wrapper

Scope: build-only TypeScript typing correction after V439 Aiven migration.

- `getPool().query()` now explicitly returns `QueryResult<any>` rather than allowing the `pg` overload to infer each row as `any[]`.
- Fixes `TS2339: Property id does not exist on type any[]` in `src/app/api/import/master/route.ts` and prevents the same wrong row inference at other runtime DB call sites.
- No SQL, Planning Chain, Batch, Schedule, Recipe, Chemical Line, Masking/Unmasking, Production, Storage, Auth, or Aiven connection behavior changed.
