# V537 — Planning Board import resolution build fix

- Baseline: V536.
- Fix only TypeScript module resolution for Planning Board.
- Changed three helper imports from `@/...` aliases to relative imports.
- `CHANGED_ONLY` now also includes the three helper modules required by Planning Board:
  - `src/components/app-toast-provider.tsx`
  - `src/hooks/use-popup-message.ts`
  - `src/lib/fetch-json.ts`
- No change to Excel multi-paste behavior or Planning/Batch/Scheduling logic.
