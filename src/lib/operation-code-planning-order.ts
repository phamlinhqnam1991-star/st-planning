/**
 * Next Operation Sort Order for RAW Operation Code / NextOperation.
 * Applies to Planning, ST_SCOPE_ONLY and Bridge Intermediate codes.
 * Independent from Main Planning Order, READY/WAIT and Planning Chain.
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
