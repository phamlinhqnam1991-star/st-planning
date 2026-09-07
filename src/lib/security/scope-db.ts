import type {PoolClient} from "pg";
import {scopeAllows,type AccessContext} from "@/lib/security/access";
export function canPlanningMain(ctx:AccessContext,op:string){return scopeAllows(ctx,"PLANNING_MAIN",op);}
export async function resolveScheduleAreaCode(c:PoolClient,resourceCode:string,standardOperation?:string|null){
 const q=await c.query(`
  select a.schedule_area_code
  from md_schedule_area a
  left join md_schedule_area_operation ao on ao.schedule_area_code=a.schedule_area_code and ao.is_active=true
  left join md_schedule_resource r on r.resource_code=$1 and r.is_active=true
  where a.is_active=true and (
    upper(coalesce(a.resource_code,''))=upper($1)
    or (coalesce(a.resource_code,'')='' and upper(coalesce(a.resource_group,''))=upper(coalesce(r.resource_group,'')))
    or ($2<>'' and upper(coalesce(ao.standard_operation,''))=upper($2))
  )
  order by case when upper(coalesce(a.resource_code,''))=upper($1) then 0 when $2<>'' and upper(coalesce(ao.standard_operation,''))=upper($2) then 1 else 2 end,a.display_order
  limit 1
 `,[resourceCode,String(standardOperation||"")]);
 return q.rows[0]?.schedule_area_code?String(q.rows[0].schedule_area_code):null;
}
export async function canScheduleResource(c:PoolClient,ctx:AccessContext,resourceCode:string,standardOperation?:string|null){
 const key=await resolveScheduleAreaCode(c,resourceCode,standardOperation);return {allowed:scopeAllows(ctx,"SCHEDULE_AREA",key),scopeKey:key};
}
export async function resolveProductionAreaCode(c:PoolClient,batchId:number){
 const q=await c.query(`
  select a.area_code
  from planning_batch b
  join md_operation_master om on om.standard_operation=b.standard_operation
  join md_area_operation_group ag on ag.st_group=om.st_group and ag.is_active=true
  join md_area a on a.id=ag.area_id and a.is_active=true
  where b.id=$1 limit 1
 `,[batchId]);
 return q.rows[0]?.area_code?String(q.rows[0].area_code):null;
}
export async function canProductionBatch(c:PoolClient,ctx:AccessContext,batchId:number){const key=await resolveProductionAreaCode(c,batchId);return {allowed:scopeAllows(ctx,"PRODUCTION_AREA",key),scopeKey:key};}
