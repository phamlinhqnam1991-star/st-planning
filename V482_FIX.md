# V482 — Audit VI/EN UI pairs

- Audited the full `src/lib/i18n/ui-catalog.json` catalog.
- Normalized conflicting duplicate English keys so one global English phrase no longer maps to multiple Vietnamese meanings.
- Corrected Vietnamese labels that were accidentally English-only/uppercase placeholders where a Vietnamese UI label is appropriate.
- Preserved ST Planning domain identifiers (Job, Batch, Recipe, Main Operation, Operation Code, READY/WAIT, etc.) where translating them would reduce consistency with production terminology.
- Removed exact duplicate catalog rows only; no business logic, API, database, RBAC, Planning, Scheduling or Production behavior changed.
