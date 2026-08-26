/**
 * Planning Operation Order schema guard.
 *
 * Keeps the UI safe when application code is deployed before the SQL migration.
 * This is intentionally limited to the single additive configuration column used
 * for manual Candidate sorting and future Auto Planning priority.
 */
export async function ensurePlanningSortOrderSchema(client:any){
 await client.query(`
  alter table public.md_operation_master
  add column if not exists planning_sort_order integer
 `);


 await client.query(`
  create index if not exists idx_md_operation_master_planning_sort_order
      on public.md_operation_master(planning_sort_order)
 `);
}
