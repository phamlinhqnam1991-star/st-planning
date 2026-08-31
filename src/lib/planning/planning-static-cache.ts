import {revalidateTag,unstable_cache} from "next/cache";
import {getPool} from "@/lib/db";
import {visibleOperations} from "@/lib/planning/visible-operations";
import {loadLiveRecipeContext,type LiveRecipeContext} from "@/lib/planning/live-recipe";

export const getPlanningStaticData=unstable_cache(async()=>{
 const c=await getPool().connect();
 try{
  const [areasQ,opsQ,matrixOpsQ,visibleOpsQ,nextOpsQ,sourceColumnsQ,operationMappingsQ]=await Promise.all([
   c.query(`select id,area_name from md_area where is_active=true order by sort_order,area_name`),
   c.query(`
    select s.standard_operation,s.sort_order,om.st_group,a.id area_id,a.area_name
    from md_planning_operation_scope s
    left join md_operation_master om on om.standard_operation=s.standard_operation and om.is_active=true
    left join md_area_operation_group ag on ag.st_group=om.st_group and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    where s.is_active=true order by s.sort_order`),
   c.query(`
    select s.standard_operation,s.sort_order operation_sort,om.planning_sort_order,om.st_group,
           a.id area_id,a.area_name,coalesce(a.sort_order,999999) area_sort,
           coalesce(sg.sort_order,999999) st_group_sort
    from md_planning_operation_scope s
    left join md_operation_master om on om.standard_operation=s.standard_operation and om.is_active=true
    left join md_st_group sg on sg.st_group=om.st_group and sg.is_active=true
    left join md_area_operation_group ag on ag.st_group=om.st_group and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    where s.is_active=true
    order by coalesce(a.sort_order,999999),coalesce(sg.sort_order,999999),s.sort_order,s.standard_operation`),
   visibleOperations(c),
   c.query(`
    select upper(trim(j.next_operation)) operation_code,count(*)::int jobs
    from open_job_current j
    where j.is_open=true and nullif(trim(coalesce(j.next_operation,'')),'') is not null
    group by upper(trim(j.next_operation)) order by jobs desc,operation_code`),
   c.query(`
    select distinct source_column
    from md_open_job_column_value
    where is_active=true and nullif(trim(source_column),'') is not null
    order by source_column`),
   // v291: deterministic source Operation -> Main Operation winners used by
   // Candidate header derivation. Keep this aligned with syncPlanningChains().
   c.query(`
    with ranked as (
      select
        m.id,m.source_operation_code,m.st_group,m.standard_operation_rule,
        m.mapping_rule,m.sort_order,m.created_at,m.updated_at,
        row_number() over(
          partition by upper(trim(m.source_operation_code))
          order by
            case
              when m.mapping_rule='DIRECT' then 0
              when m.mapping_rule='SEQUENCE/FALLBACK' then 1
              else 2
            end,
            coalesce(m.sort_order,2147483647),
            m.updated_at desc nulls last,
            m.created_at desc nulls last,
            m.id desc
        ) rn
      from md_st_operation_mapping m
      join md_st_operation_scope scope
        on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
       and scope.is_active=true
       and scope.operation_type='PLANNING_OPERATION'
      where m.is_active=true
    )
    select id,source_operation_code,st_group,standard_operation_rule,mapping_rule,sort_order
    from ranked
    where rn=1
    order by source_operation_code`)
  ]);
  return {
   areas:areasQ.rows,
   operations:opsQ.rows,
   matrixOperations:matrixOpsQ.rows,
   visibleOperations:visibleOpsQ as any[],
   nextOperations:nextOpsQ.rows,
   sourceColumns:sourceColumnsQ.rows.map((r:any)=>String(r.source_column)),
   operationMappings:operationMappingsQ.rows
  };
 }finally{c.release();}
},["planning-static-data"],{revalidate:300,tags:["planning-static"]});


export function invalidatePlanningStaticData(){
 revalidateTag("planning-static",{expire:0});
}

// Live recipe context contains Maps and is not safely serializable through Next's
// persistent cache. Keep a short per-instance cache to avoid re-reading the five
// recipe/master tables on every Candidate filter request.
let liveContextCache:{expires:number;value:LiveRecipeContext}|null=null;
let liveContextPromise:Promise<LiveRecipeContext>|null=null;
export async function getCachedLiveRecipeContext(existingClient?:any){
 const now=Date.now();
 if(liveContextCache&&liveContextCache.expires>now)return liveContextCache.value;
 if(liveContextPromise)return liveContextPromise;
 liveContextPromise=(async()=>{
  const c=existingClient||await getPool().connect();
  const ownsClient=!existingClient;
  try{
   const value=await loadLiveRecipeContext(c);
   liveContextCache={value,expires:Date.now()+60_000};
   return value;
  }finally{
   if(ownsClient)c.release();
   liveContextPromise=null;
  }
 })();
 return liveContextPromise;
}

let recipeMetaCache:{expires:number;rows:any[]}|null=null;
export async function getCachedRecipeMeta(existingClient?:any){
 const now=Date.now();
 if(recipeMetaCache&&recipeMetaCache.expires>now)return recipeMetaCache.rows;
 const c=existingClient||await getPool().connect();
 const ownsClient=!existingClient;
 try{
  const q=await c.query(`select recipe_key,recipe_no,recipe_name from md_process_recipe where is_active=true`);
  recipeMetaCache={rows:q.rows,expires:Date.now()+60_000};
  return q.rows;
 }finally{
  if(ownsClient)c.release();
 }
}
