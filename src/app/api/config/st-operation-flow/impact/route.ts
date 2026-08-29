import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const validType=new Set(["PLANNING_OPERATION","ST_SCOPE_ONLY"]);
const validRule=new Set(["DIRECT","OCCURRENCE","SEQUENCE","SEQUENCE/FALLBACK"]);

export async function POST(req:Request){
  const b=await req.json().catch(()=>({}));
  const source=clean(b.source_operation_code).toUpperCase();
  const type=clean(b.operation_type||"PLANNING_OPERATION").toUpperCase();
  const standard=clean(b.standard_operation).toUpperCase();
  const group=clean(b.st_group);
  const areaId=Number(b.area_id);
  const scheduleArea=clean(b.schedule_area_code).toUpperCase();
  const planner=clean(b.planner_owner);
  const rule=clean(b.mapping_rule||"DIRECT").toUpperCase();
  if(!source||!validType.has(type))return NextResponse.json({error:"Source Operation và Operation Type là bắt buộc."},{status:400});
  if(type==="PLANNING_OPERATION"&&(!standard||!group||!Number.isFinite(areaId)||!scheduleArea||!validRule.has(rule)||!["1","2"].includes(planner)))
    return NextResponse.json({error:"Planning Operation cần đủ Standard Operation, Group, Area, Schedule Area, Planner và Mapping Rule."},{status:400});
  const c=await getPool().connect();
  try{
    const warnings:string[]=[];
    const errors:string[]=[];
    const [openQ,candidateQ,plannedQ,mainQ,groupQ,areaQ,scheduleQ,plannerQ,recipeQ,timeQ]=await Promise.all([
      c.query(`select count(*)::int n from open_job_current where is_open=true and upper(trim(next_operation))=$1`,[source]),
      c.query(`select count(*)::int n from planning_job_operation where is_active=true and status in ('ELIGIBLE','PLANNED') and upper(trim(source_operation_code))=$1`,[source]),
      c.query(`select count(distinct bj.batch_id)::int n from planning_batch_job bj where upper(trim(bj.source_operation_code))=$1`,[source]),
      type==="PLANNING_OPERATION"?c.query(`select standard_operation,st_group,batch_prefix,is_active from md_operation_master where upper(standard_operation)=upper($1) limit 1`,[standard]):Promise.resolve({rows:[],rowCount:0} as any),
      type==="PLANNING_OPERATION"?c.query(`select st_group,is_active from md_st_group where st_group=$1 limit 1`,[group]):Promise.resolve({rows:[],rowCount:0} as any),
      type==="PLANNING_OPERATION"?c.query(`select id,area_code,area_name,is_active from md_area where id=$1`,[areaId]):Promise.resolve({rows:[],rowCount:0} as any),
      type==="PLANNING_OPERATION"?c.query(`select schedule_area_code,resource_group,resource_code,is_active from md_schedule_area where upper(schedule_area_code)=upper($1) and is_active=true`,[scheduleArea]):Promise.resolve({rows:[],rowCount:0} as any),
      type==="PLANNING_OPERATION"?c.query(`select planner_owner,is_active from md_planner_work_assignment where schedule_area_code=$1 and is_active=true`,[scheduleArea]):Promise.resolve({rows:[],rowCount:0} as any),
      type==="PLANNING_OPERATION"?c.query(`select count(*)::int n from md_operation_recipe_mapping where is_active=true and standard_operation=$1`,[standard]):Promise.resolve({rows:[{n:0}],rowCount:1} as any),
      type==="PLANNING_OPERATION"?c.query(`select count(*)::int n from md_recipe_time_rule t join md_operation_recipe_mapping m on m.recipe_key=t.recipe_key and m.is_active=true where m.standard_operation=$1 and t.is_active=true`,[standard]):Promise.resolve({rows:[{n:0}],rowCount:1} as any)
    ]);
    const openJobs=Number(openQ.rows[0]?.n||0), candidates=Number(candidateQ.rows[0]?.n||0), batches=Number(plannedQ.rows[0]?.n||0);
    if(type==="PLANNING_OPERATION"){
      if(!mainQ.rowCount)errors.push(`Chưa có Main Operation Master cho ${standard}.`);
      else if(!mainQ.rows[0].is_active)errors.push(`Main Operation ${standard} đang inactive.`);
      if(!groupQ.rowCount)errors.push(`Chưa có ST Group ${group}.`);
      if(!areaQ.rowCount)errors.push(`Physical Area không tồn tại hoặc đã inactive.`);
      if(!scheduleQ.rowCount)errors.push(`Schedule Area ${scheduleArea} không tồn tại hoặc đã inactive.`);
      else{
        const mapQ=await c.query(`select 1 from md_schedule_area_operation where schedule_area_code=$1 and standard_operation=$2 and is_active=true limit 1`,[scheduleArea,standard]);
        if(!mapQ.rowCount)errors.push(`${standard} chưa được map vào Schedule Area ${scheduleArea}.`);
      }
      if(!plannerQ.rowCount)errors.push(`Schedule Area ${scheduleArea} chưa có Planner Owner.`);
      else if(!plannerQ.rows.some((x:any)=>String(x.planner_owner)===planner))warnings.push(`Planner Owner hiện tại của ${scheduleArea} khác Planner ${planner}.`);
      if(Number(recipeQ.rows[0]?.n||0)===0)warnings.push(`${standard} chưa có Recipe Mapping; Planning có thể cần chọn Recipe thủ công.`);
      if(Number(timeQ.rows[0]?.n||0)===0)warnings.push(`${standard} chưa có Process Time Rule; khi điều độ có thể phải nhập Duration.`);
    }
    if(openJobs>0)warnings.push(`${openJobs.toLocaleString("vi-VN")} Open Job sẽ chịu ảnh hưởng bởi Source Operation này.`);
    if(candidates>0)warnings.push(`${candidates.toLocaleString("vi-VN")} dòng Planning hiện tại sẽ được rebuild.`);
    if(batches>0)warnings.push(`${batches.toLocaleString("vi-VN")} Batch lịch sử/liên quan được giữ nguyên, không xóa.`);
    return NextResponse.json({ok:errors.length===0,errors,warnings,impact:{openJobs,candidates,batches},operation:{source,type,standard,group,areaId,scheduleArea,planner,rule}});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
  finally{c.release()}
}
