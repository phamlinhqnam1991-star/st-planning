$ErrorActionPreference = "Stop"
$stale = @(
  "src/app/api/config/batch-key-recipe-rules/route.ts",
  "src/app/api/config/st-operation-flow/bulk/route.ts",
  "src/app/api/config/st-operation-flow/impact/route.ts",
  "src/app/api/planning/candidate-metadata/route.ts",
  "src/app/api/planning/snapshot/candidates/route.ts",
  "src/app/api/schedule/chemical-suggestion/route.ts",
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
  "src/proxy.ts",
)

$removed = 0
foreach ($p in $stale) {
  if (Test-Path $p) {
    Remove-Item -Force -Recurse $p
    Write-Host "REMOVED $p"
    $removed++
  }
}

Remove-Item -Force -Recurse -ErrorAction SilentlyContinue ".next"
Remove-Item -Force -ErrorAction SilentlyContinue "tsconfig.tsbuildinfo"
Write-Host "Done. Removed $removed stale source file(s)."
