# v349 TypeScript build fix

Fixed strict TypeScript errors introduced by Recipe Compatibility Conditions v348:

- `batch-compatibility/route.ts`: `loadBatchMemberConditionData` now returns `Promise<Record<string, unknown>[]>`; `findIndex` row is explicitly typed.
- `batch/route.ts`: persisted batch compatibility conditions now use `BatchCompatibilityRuleCondition[]` instead of `ProcessTimeRuleCondition[]`.

No database migration is required beyond migrations already required by earlier versions.
