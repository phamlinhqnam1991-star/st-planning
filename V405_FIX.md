# V405 Build Fix

- Fix Next.js/TypeScript production build error TS7006 in `src/lib/planning/planning-view-server.ts`.
- Explicitly types the `directPlanningCodes.every()` callback parameter as `string`.
- No planning, bridge, dashboard, batch, recipe, schedule, or hold logic changed.
