import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const text=(v:unknown)=>String(v??"").trim();
const bool=(v:unknown)=>Boolean(v);
const nullableNumber=(v:unknown)=>{
 const s=String(v??"").trim();
 if(!s)return null;
 const n=Number(s);
 return Number.isFinite(n)?n:null;
};
const nullableInt=(v:unknown)=>{
 const n=nullableNumber(v);
 return n==null?null:Math.trunc(n);
};

const MODES=new Set(["OFF","SUGGEST","FULL_AUTO"]);

export async function POST(req:Request){
 const body=await req.json().catch(()=>({}));

 const standardOperation=text(body.standard_operation);
 if(!standardOperation)
  return NextResponse.json({error:"Standard Operation là bắt buộc."},{status:400});

 const mode=text(body.auto_plan_mode).toUpperCase()||"OFF";
 if(!MODES.has(mode))
  return NextResponse.json({error:"Auto Plan Mode không hợp lệ."},{status:400});

 const minJobs=nullableInt(body.min_jobs_per_batch);
 const maxJobs=nullableInt(body.max_jobs_per_batch);
 const minQty=nullableNumber(body.min_qty_per_batch);
 const maxQty=nullableNumber(body.max_qty_per_batch);
 const minSurface=nullableNumber(body.min_surface_dm2_per_batch);
 const maxSurface=nullableNumber(body.max_surface_dm2_per_batch);

 if(minJobs!=null&&maxJobs!=null&&minJobs>maxJobs)
  return NextResponse.json({error:"Min Jobs không được lớn hơn Max Jobs."},{status:400});
 if(minQty!=null&&maxQty!=null&&minQty>maxQty)
  return NextResponse.json({error:"Min Qty không được lớn hơn Max Qty."},{status:400});
 if(minSurface!=null&&maxSurface!=null&&minSurface>maxSurface)
  return NextResponse.json({error:"Min Surface không được lớn hơn Max Surface."},{status:400});

 const priorityRules=Array.isArray(body.priority_rules)
  ? body.priority_rules
      .filter((x:any)=>x&&text(x.field))
      .slice(0,10)
      .map((x:any)=>({
        field:text(x.field),
        direction:text(x.direction).toLowerCase()==="desc"?"desc":"asc"
      }))
  : [];

 const c=await getPool().connect();
 try{
  const op=await c.query(`
   select 1
   from md_operation_master
   where standard_operation=$1 and is_active=true
  `,[standardOperation]);

  if(!op.rowCount)
   return NextResponse.json({error:"Standard Operation không tồn tại."},{status:400});

  const q=await c.query(`
   insert into md_auto_planning_rule(
    standard_operation,
    auto_plan_enabled,auto_plan_mode,auto_plan_order,
    allow_first_plan_operation,
    allow_actual_wip_without_previous_batch,
    allow_from_previous_batch,
    allow_plan_ahead,
    require_previous_completed,
    require_same_recipe,
    group_by_previous_batch,
    require_same_part,
    require_same_revision,
    require_same_program,
    require_same_primer1,
    require_same_primer2,
    require_same_primer3,
    recipe_required,
    exclude_open_dmr,
    min_jobs_per_batch,max_jobs_per_batch,
    min_qty_per_batch,max_qty_per_batch,
    min_surface_dm2_per_batch,max_surface_dm2_per_batch,
    split_on_recipe,
    split_on_previous_batch,
    split_on_part,
    split_on_revision,
    split_on_program,
    split_on_primer1,
    split_on_primer2,
    split_on_primer3,
    priority_rules,
    note,is_active,updated_at
   )
   values(
    $1,
    $2,$3,$4,
    $5,$6,$7,$8,$9,
    $10,$11,$12,$13,$14,$15,$16,$17,
    $18,$19,
    $20,$21,$22,$23,$24,$25,
    $26,$27,$28,$29,$30,$31,$32,$33,
    $34::jsonb,
    $35,true,now()
   )
   on conflict(standard_operation)
   do update set
    auto_plan_enabled=excluded.auto_plan_enabled,
    auto_plan_mode=excluded.auto_plan_mode,
    auto_plan_order=excluded.auto_plan_order,
    allow_first_plan_operation=excluded.allow_first_plan_operation,
    allow_actual_wip_without_previous_batch=excluded.allow_actual_wip_without_previous_batch,
    allow_from_previous_batch=excluded.allow_from_previous_batch,
    allow_plan_ahead=excluded.allow_plan_ahead,
    require_previous_completed=excluded.require_previous_completed,
    require_same_recipe=excluded.require_same_recipe,
    group_by_previous_batch=excluded.group_by_previous_batch,
    require_same_part=excluded.require_same_part,
    require_same_revision=excluded.require_same_revision,
    require_same_program=excluded.require_same_program,
    require_same_primer1=excluded.require_same_primer1,
    require_same_primer2=excluded.require_same_primer2,
    require_same_primer3=excluded.require_same_primer3,
    recipe_required=excluded.recipe_required,
    exclude_open_dmr=excluded.exclude_open_dmr,
    min_jobs_per_batch=excluded.min_jobs_per_batch,
    max_jobs_per_batch=excluded.max_jobs_per_batch,
    min_qty_per_batch=excluded.min_qty_per_batch,
    max_qty_per_batch=excluded.max_qty_per_batch,
    min_surface_dm2_per_batch=excluded.min_surface_dm2_per_batch,
    max_surface_dm2_per_batch=excluded.max_surface_dm2_per_batch,
    split_on_recipe=excluded.split_on_recipe,
    split_on_previous_batch=excluded.split_on_previous_batch,
    split_on_part=excluded.split_on_part,
    split_on_revision=excluded.split_on_revision,
    split_on_program=excluded.split_on_program,
    split_on_primer1=excluded.split_on_primer1,
    split_on_primer2=excluded.split_on_primer2,
    split_on_primer3=excluded.split_on_primer3,
    priority_rules=excluded.priority_rules,
    note=excluded.note,
    is_active=true,
    updated_at=now()
   returning *
  `,[
   standardOperation,
   bool(body.auto_plan_enabled),mode,Math.max(1,Number(body.auto_plan_order)||100),
   bool(body.allow_first_plan_operation),
   bool(body.allow_actual_wip_without_previous_batch),
   bool(body.allow_from_previous_batch),
   bool(body.allow_plan_ahead),
   bool(body.require_previous_completed),
   bool(body.require_same_recipe),
   bool(body.group_by_previous_batch),
   bool(body.require_same_part),
   bool(body.require_same_revision),
   bool(body.require_same_program),
   bool(body.require_same_primer1),
   bool(body.require_same_primer2),
   bool(body.require_same_primer3),
   bool(body.recipe_required),
   bool(body.exclude_open_dmr),
   minJobs,maxJobs,minQty,maxQty,minSurface,maxSurface,
   bool(body.split_on_recipe),
   bool(body.split_on_previous_batch),
   bool(body.split_on_part),
   bool(body.split_on_revision),
   bool(body.split_on_program),
   bool(body.split_on_primer1),
   bool(body.split_on_primer2),
   bool(body.split_on_primer3),
   JSON.stringify(priorityRules),
   text(body.note)||null
  ]);

  return NextResponse.json({ok:true,rule:q.rows[0]});
 }catch(e){
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:400}
  );
 }finally{
  c.release();
 }
}
