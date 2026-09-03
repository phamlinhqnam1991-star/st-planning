import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";

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
  const params:any[]=[];
  const where=[
   "j.is_open=true",
   "p.is_active=true",
   "upper(trim(p.standard_operation))<>'PIONBL'",
   "(coalesce(p.is_hold,false)=true or p.status in ('ELIGIBLE','LOCKED'))"
  ];
  if(areaId){params.push(areaId);where.push(`a.id=$${params.length}`);}
  if(op){params.push(op);where.push(`upper(trim(p.standard_operation))=upper(trim($${params.length}))`);}

  const q=await c.query(`
   with area_by_group as (
    select ag.st_group,min(ag.area_id) area_id
    from public.md_area_operation_group ag
    join public.md_area ax on ax.id=ag.area_id and ax.is_active=true
    where ag.is_active=true
    group by ag.st_group
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
    from public.planning_job_operation p
    join public.open_job_current j on j.job_num=p.job_num
    left join area_by_group abg on abg.st_group=p.st_group
    left join public.md_area a on a.id=abg.area_id and a.is_active=true
    left join public.md_operation_master om on om.standard_operation=p.standard_operation and om.is_active=true
    left join public.md_planning_operation_scope scope on scope.standard_operation=p.standard_operation and scope.is_active=true
    where ${where.join(" and ")}
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
