# V480 — Fix remaining `pg` / `tls` client bundle leak

## Symptom
Next.js build fails with:

`Module not found: Can't resolve 'tls'`

Import trace reaches `pg` through:

`erp-all-tabs-demo.tsx -> @/components/erp/client -> erp-app-header.tsx -> security/access.ts -> db.ts -> pg`

## Root cause
V479 correctly introduced a client-safe ERP barrel, but `src/components/erp/client.ts` still exported `ErpAppHeader`.
`ErpAppHeader` is a Server Component because it reads the authenticated Aiven access context. Exporting it from the client barrel caused the entire Aiven/PostgreSQL security chain to become reachable from Client Components.

## Fix
Removed `ErpAppHeader` from `src/components/erp/client.ts`.

Server pages continue importing `ErpAppHeader` directly from:

`@/components/erp/erp-app-header`

Client Components continue importing UI-only components from:

`@/components/erp/client`

The server barrel `@/components/erp` is unchanged for Server Components such as `ErpAppShell`.

## Scope
Build-boundary fix only. No change to Aiven RBAC, login, permissions, scope, Planning, Scheduling, Production, Recipe, Process Time, READY/WAIT, or database schema.

No SQL migration is required.
