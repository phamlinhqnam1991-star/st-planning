import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";

type Metric={jobs:number;qty:number;surface:number};
const zeroMetric=():Metric=>({jobs:0,qty:0,surface:0});

export async function GET(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;

 const url=new URL(req.url);
 const areaIdRaw=String(url.searchParams.get("areaId")||"").trim();
 const op=String(url.searchParams.get("op")||"").trim();
 const areaId=areaIdRaw?Number(areaIdRaw):null;
 if(areaIdRaw&&(!Number.isFinite(areaId)||Number(areaId)<=0)){
  return NextResponse.json({error:"areaId không hợp lệ."},{status:400});
 }

 const c=await getPool().connect();
 try{
  // V425: Workload Summary must use the SAME Job population as the Planning
  // Board rows. Route Matrix drill-down starts from Candidate rows, whose
  // membership is: Open Job + live Current Main + RAW NextOperation in the
  // resolved ST View. Do not aggregate every active planning_job_operation in
  // the database, otherwise a Main such as CMSA can show dozens of historical /
  // out-of-view Jobs while clicking CMSA READY reveals only the Candidate rows.
  const {stViewParams}=await resolvePlanningView(c,op,areaIdRaw);
  if(!stViewParams.length){
   return NextResponse.json({rows:[],totals:{READY:zeroMetric(),WAIT:zeroMetric(),HOLD:zeroMetric()},scope:{areaId:areaId||null,op:op||null}});
  }

  const params:any[]=[stViewParams];
  const candidateWhere=[
   "j.is_open=true",
   "current_main.id is not null",
   "upper(trim(coalesce(j.next_operation,''))) = any($1::text[])"
  ];
  const baseWhere=[
   "j.is_open=true",
   "p.is_active=true",
   "upper(trim(p.standard_operation))<>'PIONBL'",
   "(coalesce(p.is_hold,false)=true or p.status in ('ELIGIBLE','LOCKED'))"
  ];
  if(areaId){
   params.push(areaId);
   const n=params.length;
   candidateWhere.push(`candidate_area.area_id=$${n}`);
   baseWhere.push(`row_area.area_id=$${n}`);
  }
  if(op){
   params.push(op);
   const n=params.length;
   candidateWhere.push(`upper(trim(current_main.standard_operation))=upper(trim($${n}))`);
   baseWhere.push(`upper(trim(p.standard_operation))=upper(trim($${n}))`);
  }

  const q=await c.query(`
   with candidate_jobs as (
    select j.job_num
    from public.open_job_current j
    left join lateral (
     select p0.id,p0.standard_operation,p0.source_operation_code,p0.st_group
     from public.planning_job_operation p0
     where p0.job_num=j.job_num
       and p0.is_active=true
       and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
     order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
     limit 1
    ) current_main on true
    left join lateral (
     select ag.area_id
     from public.md_area_operation_group ag
     join public.md_area ax
       on ax.id=ag.area_id
      and ax.is_active=true
     where current_main.id is not null
       and ag.st_group=current_main.st_group
       and ag.is_active=true
     order by
       ax.sort_order asc nulls last,
       ax.area_name asc,
       ag.area_id asc
     limit 1
    ) candidate_area on true
    where ${candidateWhere.join(" and ")}
   ), base as (
    select
     p.job_num,
     p.standard_operation,
     coalesce(a.id,0)::bigint area_id,
     coalesce(a.area_name,'Unmapped') area_name,
     coalesce(a.sort_order,999999)::int area_sort,
     coalesce(om.planning_sort_order,scope.sort_order,999999)::int main_order,
     case
      when coalesce(p.is_hold,false) then 'HOLD'
      when p.status='ELIGIBLE' then 'READY'
      when p.status='LOCKED' then 'WAIT'
      else null
     end bucket,
     coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
     coalesce(
      j.total_surface,
      coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) * coalesce(j.surface_per_part_dm2,0),
      0
     )::numeric surface
    from candidate_jobs cj
    join public.open_job_current j on j.job_num=cj.job_num
    join public.planning_job_operation p on p.job_num=cj.job_num
    left join lateral (
     select ag.area_id
     from public.md_area_operation_group ag
     join public.md_area ax
       on ax.id=ag.area_id
      and ax.is_active=true
     where ag.st_group=p.st_group
       and ag.is_active=true
     order by
       ax.sort_order asc nulls last,
       ax.area_name asc,
       ag.area_id asc
     limit 1
    ) row_area on true
    left join public.md_area a on a.id=row_area.area_id and a.is_active=true
    left join public.md_operation_master om on om.standard_operation=p.standard_operation and om.is_active=true
    left join public.md_planning_operation_scope scope on scope.standard_operation=p.standard_operation and scope.is_active=true
    where ${baseWhere.join(" and ")}
   ), per_job_main as (
    -- One physical Job is counted once for the same Main + status bucket.
    -- Repeated occurrences in the same bucket must not multiply pcs/surface.
    select
     job_num,standard_operation,area_id,area_name,area_sort,main_order,bucket,
     max(qty) qty,max(surface) surface
    from base
    where bucket is not null
    group by job_num,standard_operation,area_id,area_name,area_sort,main_order,bucket
   )
   select
    area_id,area_name,area_sort,standard_operation,main_order,bucket,
    count(*)::int jobs,
    coalesce(sum(qty),0)::float8 qty,
    coalesce(sum(surface),0)::float8 surface
   from per_job_main
   group by area_id,area_name,area_sort,standard_operation,main_order,bucket
   order by area_sort,main_order,standard_operation,bucket
  `,params);

  const byKey=new Map<string,any>();
  const totals:{READY:Metric;WAIT:Metric;HOLD:Metric}={READY:zeroMetric(),WAIT:zeroMetric(),HOLD:zeroMetric()};
  for(const raw of q.rows as any[]){
   const key=`${raw.area_id}|${raw.standard_operation}`;
   let row=byKey.get(key);
   if(!row){
    row={
     areaId:Number(raw.area_id||0),areaName:String(raw.area_name||"Unmapped"),areaSort:Number(raw.area_sort||999999),
     standardOperation:String(raw.standard_operation||""),mainOrder:Number(raw.main_order||999999),
     ready:zeroMetric(),wait:zeroMetric(),hold:zeroMetric()
    };
    byKey.set(key,row);
   }
   const metric:Metric={jobs:Number(raw.jobs||0),qty:Number(raw.qty||0),surface:Number(raw.surface||0)};
   const bucket=String(raw.bucket||"").toUpperCase() as keyof typeof totals;
   if(bucket==="READY")row.ready=metric;
   else if(bucket==="WAIT")row.wait=metric;
   else if(bucket==="HOLD")row.hold=metric;
   if(bucket in totals){
    totals[bucket].jobs+=metric.jobs;
    totals[bucket].qty+=metric.qty;
    totals[bucket].surface+=metric.surface;
   }
  }

  const rows=[...byKey.values()].map(row=>({
   ...row,
   total:{
    jobs:Number(row.ready.jobs||0)+Number(row.wait.jobs||0)+Number(row.hold.jobs||0),
    qty:Number(row.ready.qty||0)+Number(row.wait.qty||0)+Number(row.hold.qty||0),
    surface:Number(row.ready.surface||0)+Number(row.wait.surface||0)+Number(row.hold.surface||0)
   }
  }));
  return NextResponse.json({rows,totals,scope:{areaId:areaId||null,op:op||null}});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
