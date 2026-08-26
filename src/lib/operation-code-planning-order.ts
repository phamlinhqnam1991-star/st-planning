/**
 * Global production priority for raw Operation Code / NextOperation.
 * Independent from Job routing and Standard Operation mapping.
 * Shared seam for Candidate sorting now and Auto Planning later.
 */
export async function ensureOperationCodePlanningOrderSchema(client:any){
 await client.query(`
  alter table public.md_operation
  add column if not exists planning_sort_order integer
 `);

 await client.query(`
  create index if not exists idx_md_operation_planning_sort_order
      on public.md_operation(planning_sort_order)
 `);
}
