/**
 * Active Planning Batches used by both Candidate Batch Builder and the
 * dedicated Recent Planning Batches view.
 */
export async function getRecentPlanningBatches(client:any,limit=100){
 const safeLimit=Math.min(500,Math.max(1,Math.trunc(Number(limit)||100)));

 return client.query(`
  select
   b.id,b.batch_no,b.planning_date,b.standard_operation,b.recipe_key,
   b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
   b.planned_start,b.planned_end,b.status,b.priority,
   a.area_name,
   r.recipe_no,r.recipe_name,
   sch.schedule_id,
   sch.schedule_status,
   sch.resource_code,
   sch.schedule_start,
   sch.schedule_end
  from planning_batch b
  left join md_area a on a.id=b.area_id
  left join md_process_recipe r on r.recipe_key=b.recipe_key
  left join lateral (
   select
    ps.id schedule_id,
    ps.status schedule_status,
    ps.resource_code,
    ps.planned_start schedule_start,
    ps.planned_end schedule_end
   from planning_schedule ps
   where ps.batch_id=b.id
     and ps.status<>'CANCELLED'
   order by ps.planned_start desc,ps.id desc
   limit 1
  ) sch on true
  where b.status not in ('CANCELLED','COMPLETED')
  order by b.created_at desc
  limit $1
 `,[safeLimit]);
}
