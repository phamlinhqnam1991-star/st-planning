import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {
 loadProcessTimeRules,
 processConditionSignature,
 selectProcessConditionGroupFromRules
} from "@/lib/planning/batch-utils";
import {describeCompatibilityConditions} from "@/lib/planning/batch-compatibility";

const clean=(v:unknown)=>String(v??"").trim();
const up=(v:unknown)=>clean(v).toUpperCase();

type CandidateInput={
 id:number;
 recipeKey:string|null;
 standardOperation:string;
};

async function loadConditionDataByOperationIds(c:any,ids:number[],columns:string[]){
 const result=new Map<number,Record<string,unknown>>();
 if(!ids.length)return result;
 if(!columns.length){
  ids.forEach(id=>result.set(id,{}));
  return result;
 }
 const q=await c.query(`
  select p.id,
   coalesce(jsonb_object_agg(col_name,
    (coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data'))->>col_name
   ),'{}'::jsonb) condition_data
  from planning_job_operation p
  join open_job_current j on j.job_num=p.job_num and j.is_open=true
  cross join unnest($2::text[]) as cols(col_name)
  where p.id=any($1::bigint[])
    and p.is_active=true
  group by p.id
 `,[ids,columns]);
 for(const r of q.rows)result.set(Number(r.id),(r.condition_data||{}) as Record<string,unknown>);
 return result;
}

async function loadBatchMemberConditionData(c:any,batchId:number,columns:string[]){
 if(!columns.length){
  const q=await c.query(`select 1 from planning_batch_job where batch_id=$1 limit 1`,[batchId]);
  return q.rowCount?[{} as Record<string,unknown>]:[];
 }
 const q=await c.query(`
  select bj.id,
   coalesce(jsonb_object_agg(col_name,
    (coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data'))->>col_name
   ),'{}'::jsonb) condition_data
  from planning_batch_job bj
  join open_job_current j on j.job_num=bj.job_num
  cross join unnest($2::text[]) as cols(col_name)
  where bj.batch_id=$1
  group by bj.id
  order by bj.id
 `,[batchId,columns]);
 return q.rows.map((r:any)=>(r.condition_data||{}) as Record<string,unknown>);
}

export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;

 const body=await req.json().catch(()=>({}));
 const rawCandidates=Array.isArray(body.candidates)?body.candidates:[];
 const candidates:CandidateInput[]=rawCandidates.slice(0,5000).map((x:any)=>({
  id:Number(x?.id),
  recipeKey:clean(x?.recipeKey)||null,
  standardOperation:clean(x?.standardOperation)
 })).filter((x:CandidateInput)=>Number.isFinite(x.id)&&x.id>0&&x.standardOperation);
 const anchorId=Number(body.anchorId||0);
 const batchId=Number(body.batchId||0);

 if(!candidates.length)
  return NextResponse.json({profile:null,compatibleIds:[],reasons:{}});
 if(!batchId&&!Number.isFinite(anchorId))
  return NextResponse.json({error:"Thiếu Job chuẩn hoặc Target Batch."},{status:400});

 const c=await getPool().connect();
 try{
  let recipeKey="";
  let standardOperation="";
  let source:"JOB"|"BATCH"="JOB";

  if(batchId>0){
   const bq=await c.query(`
    select id,batch_no,standard_operation,recipe_key
    from planning_batch
    where id=$1 and status not in ('CANCELLED','COMPLETED')
    limit 1
   `,[batchId]);
   if(!bq.rowCount)return NextResponse.json({error:"Target Batch không tồn tại hoặc đã đóng."},{status:400});
   recipeKey=clean(bq.rows[0].recipe_key);
   standardOperation=clean(bq.rows[0].standard_operation);
   source="BATCH";
  }else{
   const anchor=candidates.find(x=>x.id===anchorId);
   if(!anchor)return NextResponse.json({error:"Job chuẩn không còn nằm trong Candidate hiện tại."},{status:400});
   recipeKey=clean(anchor.recipeKey);
   standardOperation=clean(anchor.standardOperation);
  }

  if(!recipeKey&&source==="BATCH"){
   const anchor=candidates.find(x=>x.id===anchorId);
   if(anchor&&up(anchor.standardOperation)===up(standardOperation)&&anchor.recipeKey){
    recipeKey=clean(anchor.recipeKey);
   }else{
    // Empty/legacy Batch chưa có Recipe: cho chọn Job đầu tiên cùng Operation.
    // Sau khi Job đầu tiên được chọn, client gọi lại endpoint với anchorId và
    // Recipe/condition lock sẽ được thiết lập ngay.
    const compatibleIds=candidates
     .filter(x=>up(x.standardOperation)===up(standardOperation))
     .map(x=>x.id);
    const allowed=new Set(compatibleIds);
    const reasons:Record<string,string[]>={};
    for(const item of candidates){
     if(!allowed.has(item.id))reasons[String(item.id)]=[`Khác Main Operation: ${item.standardOperation} ≠ ${standardOperation}`];
    }
    return NextResponse.json({
     profile:{source,batchId,anchorId:null,standardOperation,recipeKey:"",recipeNo:null,recipeName:null,conditions:[],conditionText:"Chọn Job đầu tiên để khóa Recipe"},
     compatibleIds,reasons,total:candidates.length,compatible:compatibleIds.length,locked:candidates.length-compatibleIds.length
    });
   }
  }
  if(!recipeKey){
   return NextResponse.json({error:"Job chuẩn chưa resolve được Recipe."},{status:400});
  }

  const rules=await loadProcessTimeRules(c,recipeKey);
  const conditionColumns=[...new Set(
   rules.flatMap(r=>(r.conditions||[]).map(x=>clean(x.source_column))).filter(Boolean)
  )];
  const conditionById=await loadConditionDataByOperationIds(c,candidates.map(x=>x.id),conditionColumns);

  let anchorData:Record<string,unknown>[]=[];
  if(source==="BATCH"){
   anchorData=await loadBatchMemberConditionData(c,batchId,conditionColumns);
   // Empty plan-ahead Batch: first selected/anchor Job establishes the condition group.
   if(!anchorData.length&&Number.isFinite(anchorId)&&anchorId>0){
    const d=conditionById.get(anchorId);
    if(d)anchorData=[d];
   }
  }else{
   const d=conditionById.get(anchorId);
   if(d)anchorData=[d];
  }

  const profileConditions=selectProcessConditionGroupFromRules(rules,anchorData);
  const profileSignature=processConditionSignature(profileConditions);

  const compatibleIds:number[]=[];
  const reasons:Record<string,string[]|string>={};
  for(const item of candidates){
   const why:string[]=[];
   if(up(item.standardOperation)!==up(standardOperation)){
    why.push(`Khác Main Operation: ${item.standardOperation||"—"} ≠ ${standardOperation||"—"}`);
   }
   if(clean(item.recipeKey)!==recipeKey){
    why.push(`Khác Recipe`);
   }
   if(!why.length){
    const ownConditions=selectProcessConditionGroupFromRules(rules,[conditionById.get(item.id)||{}]);
    if(processConditionSignature(ownConditions)!==profileSignature){
     why.push(
      `Khác điều kiện Recipe: ${describeCompatibilityConditions(ownConditions)} `+
      `≠ ${describeCompatibilityConditions(profileConditions)}`
     );
    }
   }
   if(why.length)reasons[String(item.id)]=why;
   else compatibleIds.push(item.id);
  }

  const rq=await c.query(`
   select recipe_no,recipe_name
   from md_process_recipe
   where recipe_key=$1
   limit 1
  `,[recipeKey]);

  return NextResponse.json({
   profile:{
    source,
    batchId:source==="BATCH"?batchId:null,
    anchorId:source==="JOB"?anchorId:(anchorId>0?anchorId:null),
    standardOperation,
    recipeKey,
    recipeNo:rq.rows[0]?.recipe_no||null,
    recipeName:rq.rows[0]?.recipe_name||null,
    conditions:profileConditions,
    conditionText:describeCompatibilityConditions(profileConditions)
   },
   compatibleIds,
   reasons,
   total:candidates.length,
   compatible:compatibleIds.length,
   locked:candidates.length-compatibleIds.length
  });
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  c.release();
 }
}
