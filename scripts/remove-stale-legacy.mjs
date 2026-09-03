import { rmSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const stale = [
  "src/app/planning-old",
  "src/app/api/config/batch-key-recipe-rules/route.ts",
  "src/app/api/config/st-operation-flow/bulk/route.ts",
  "src/app/api/config/st-operation-flow/impact/route.ts",
  "src/app/api/planning/candidate-metadata/route.ts",
  "src/app/api/planning/job-debug/route.ts",
  "src/app/api/planning/snapshot/candidates/route.ts",
  "src/app/api/schedule/chemical-suggestion/route.ts",
  "src/app/api/schedule/heal-chemical-loading/route.ts",
  "src/app/api/process-recipe/operation-map/route.ts",
  "src/app/batch-key-recipe-rules/page.tsx",
  "src/app/master/operation-recipe-mapping/page.tsx",
  "src/app/planning/snapshot/loading.tsx",
  "src/app/planning/snapshot/page.tsx",
  "src/app/planning/v2/page.tsx",
  "src/app/process-recipes/page.tsx",
  "src/components/batch-key-recipe-rule-manager.tsx",
  "src/components/chemical-recipe-mapping-manager.tsx",
  "src/components/intermediate-operations-panel.tsx",
  "src/components/missing-jobs-panel.tsx",
  "src/components/missing-operations-manager.tsx",
  "src/components/operation-recipe-mapping-master-manager.tsx",
  "src/components/operation-recipe-allowed-manager.tsx",
  "src/components/planning-area-operation-filter.tsx",
  "src/components/planning-snapshot-shell.tsx",
  "src/components/planning-v2/domain.ts",
  "src/components/planning-v2/planning-v2-batch-panel.tsx",
  "src/components/planning-v2/planning-v2-client.tsx",
  "src/components/planning-v2/planning-v2-filters.tsx",
  "src/components/planning-v2/planning-v2-grid.tsx",
  "src/components/planning-v2/types.ts",
  "src/components/planning-v2/use-planning-v2-data.ts",
  "src/components/visible-operations-manager.tsx",
  "src/lib/operation-code-planning-order.ts",
  "src/lib/planner-ownership.ts",
  "src/lib/planning-sort-order.ts",
  "src/lib/planning/candidate-snapshot.ts",
  "src/lib/planning/intermediate-bridge-segments.ts.bak",
  "src/lib/planning/intermediate-operations.ts",
  "src/lib/planning/missing-config-jobs.ts",
  "src/lib/planning/schedule-history.ts",
  "src/lib/planning/unlock-next-after-schedule.ts",
  "src/lib/st-operation-flow-apply.ts",
  "src/proxy.ts"
];

let removed = 0;

// Remove accidentally copied version/work directories at project root.
// TypeScript includes **/*.ts and **/*.tsx, so any nested old source tree can break a clean build.
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!/^(st_v\d+|work_v\d+)$/i.test(entry.name)) continue;
  const full = resolve(root, entry.name);
  rmSync(full, { force: true, recursive: true });
  console.log(`REMOVED stale version directory ${entry.name}`);
  removed += 1;
}

for (const rel of stale) {
  const full = resolve(root, rel);
  if (!existsSync(full)) continue;
  rmSync(full, { force: true, recursive: true });
  console.log(`REMOVED ${rel}`);
  removed += 1;
}

for (const rel of [".next", "tsconfig.tsbuildinfo"]) {
  const full = resolve(root, rel);
  if (!existsSync(full)) continue;
  rmSync(full, { force: true, recursive: true });
  console.log(`REMOVED cache ${rel}`);
}

console.log(`Done. Removed ${removed} stale source file(s).`);
