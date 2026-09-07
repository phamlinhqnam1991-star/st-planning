# V531 - Deploy Ready Full Package

## Purpose
Fix deployment packaging/root-structure issue reported by Vercel:
`Couldn't find any pages or app directory.`

## Scope
- No business logic changes.
- No ST Output / Planning / Batch / Scheduling logic changes.
- Keeps V530 Operation Inbox build fix.
- Runs the project's existing stale-source cleanup before packaging.
- Packages the full Next.js project with project files directly at ZIP root.

## Required root structure
- `package.json`
- `package-lock.json`
- `next.config.ts`
- `vercel.json`
- `src/app/page.tsx`
- `src/app/layout.tsx`
- `src/app/unconfigured-operations/page.tsx`

## Deployment
Use this FULL package as the project source. Do not deploy a CHANGED_ONLY package as a standalone Next.js project.
