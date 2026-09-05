# V479 — Fix `pg` / `tls` leaked into Client Component build

## Symptom
Next.js build failed with:

- `Module not found: Can't resolve 'tls'`
- Import trace reached `node_modules/pg/...`
- Client trace: `erp-all-tabs-demo.tsx -> @/components/erp -> erp-shell.tsx -> security/access.ts -> db.ts -> pg`

## Root cause
`@/components/erp/index.ts` is a mixed barrel. It exports both client-safe UI components and the server-only `ErpAppShell`.
A Client Component imported that barrel, so Next.js followed the server export graph and tried to bundle the Aiven PostgreSQL `pg` driver for the browser. `pg` depends on Node core module `tls`, which does not exist in the browser bundle.

## Fix
- Added `src/components/erp/client.ts` as a client-safe barrel.
- It intentionally does **not** export `ErpAppShell`.
- Updated these Client Components to import from the client-safe barrel:
  - `src/components/erp/erp-all-tabs-demo.tsx`
  - `src/components/erp/erp-kit-showcase.tsx`
- Server-side ERP pages can continue importing `ErpAppShell` from the existing server path/barrel.

## Scope
No RBAC rule, Aiven schema, Planning, Scheduling, Recipe, Process Time, Production, Logic Guide, or Training behavior changed.
No SQL migration is required.
