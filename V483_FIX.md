# V483 — Full VI/EN Audit & Canonical UI Language Cleanup

Scope: UI language only. No Planning, Scheduling, Production, Recipe, Batch, READY/WAIT, RBAC permission model, API business rule or database schema was changed.

## What was audited

- Entire `src/lib/i18n/ui-catalog.json`.
- Both directions: EN → VI and VI → EN.
- Exact and phrase-mode pairs.
- Duplicate / conflicting pairs after whitespace + case normalization.
- Very short grammar fragments that are unsafe in phrase replacement.
- Current navigation, login and Users & Permissions labels introduced by Aiven RBAC.
- Legacy mixed-language labels left in current TypeScript/TSX source.

## Main corrections

- Canonicalized `Scheduling Board` → `Bảng điều độ`.
- Canonicalized `Process Time` → `Thời gian xử lý`.
- Replaced mixed VI wording such as `Compatibility`, `condition`, `rule`, `dependency`, `flow`, `issue`, `runtime`, `handoff`, `reload`, `database`, `Duration`, `Start Time` when they were ordinary prose rather than protected ST identifiers.
- Preserved production identifiers intentionally: Job, Batch, Recipe, Main Operation, Operation Code, ST Group, Planning Board, All Open Jobs, Resource, Planner, Loading, Unloading, NDT, READY/WAIT/DONE, route/database column names and technical codes.
- Resolved all bidirectional translation collisions. One normalized EN phrase now maps to one VI phrase, and one normalized VI phrase maps back to one EN phrase.
- Generic grammar fragments such as `not`, `must`, `only`, `need`, `before`, `after`, `change`, `check`, `value`, `schedule` are exact-only instead of phrase-mode, preventing accidental word-by-word corruption inside longer text.
- Navigation source is now EN-first so default EN is truly English and VI is rendered from the catalog.
- Login and Users & Permissions source labels are EN-first and have explicit VI pairs.
- Added Aiven/RBAC role identifiers to protected UI terms.

## Quality gate

`scripts/check-ui-i18n.mjs` is now stricter and checks:

- non-empty EN/VI;
- valid mode;
- duplicate rows;
- EN conflicts;
- VI reverse conflicts;
- exact conflicts;
- risky phrase fragments;
- required canonical terms;
- obsolete mixed VI wording;
- critical EN-first source files.

Current result:

`UI i18n check OK · 1623 EN/VI pairs · 0 EN conflicts · 0 VI reverse conflicts · risky phrase guard OK · default EN.`

Run after future UI text changes:

```bash
npm run i18n:check
```

## Documentation synchronization

Logic & Guide and New User Training were updated in parallel to V483 terminology. Business logic remains the same as V482/V481 lineage.
