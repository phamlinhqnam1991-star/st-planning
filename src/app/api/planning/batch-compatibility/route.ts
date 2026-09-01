import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {
 loadProcessTimeRules,
 processConditionMatches,
 selectProcessConditionGroupFromRules,
 type ProcessTimeRuleCondition
} from "@/lib/planning/batch-utils";
import {
 describeCompatibilityConditions,
 loadStoredBatchCompatibilityConditions,
 normalizeCompatibilityColumns,
 selectCompatibilityConditionsByColumns
} from "@/lib/planning/batch-compatibility";

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

function mergeConditionsByColumn(
 primary:ProcessTimeRuleCondition[],
 secondary:ProcessTimeRuleCondition[]
){
 const out:ProcessTimeRuleCondition[]=[];
 const seen=new Set<string>();
 for(const c of [...primary,...secondary]){
  const column=clean(c.source_column);
  const key=column.toUpperCase();
  if(!column||seen.has(key))continue;
  seen.add(key);
  out.push({source_column:column,source_value:clean(c.source_value)});
 }
 return out;
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
 const hasRequestedColumns=Array.isArray(body.selectedConditionColumns);
 const requestedColumns=hasRequestedColumns
  ?normalizeCompatibilityColumns(body.selectedConditionColumns)
  :undefined;

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

  const scopedCandidates=candidates.filter(
   x=>up(x.standardOperation)===up(standardOperation)
  );

  if(!scopedCandidates.length){
   return NextResponse.json({
    profile:{source,batchId:source==="BATCH"?batchId:null,anchorId:anchorId>0?anchorId:null,standardOperation,recipeKey,recipeNo:null,recipeName:null,conditions:[],selectedConditions:[],selectedConditionColumns:[],conditionText:"Không có Job READY cùng Main Operation"},
    compatibleIds:[],reasons:{},total:0,compatible:0,locked:0
   });
  }

  if(!recipeKey&&source==="BATCH"){
   const anchor=scopedCandidates.find(x=>x.id===anchorId);
   if(anchor?.recipeKey)recipeKey=clean(anchor.recipeKey);
  }

  // Main không dùng Recipe: mọi READY cùng Main đều hợp lệ; condition checkbox trống.
  if(!recipeKey){
   const compatibleIds=scopedCandidates.map(x=>x.id);
   return NextResponse.json({
    profile:{
     source,batchId:source==="BATCH"?batchId:null,anchorId:anchorId>0?anchorId:null,
     standardOperation,recipeKey:"",recipeNo:null,recipeName:null,
     conditions:[],selectedConditions:[],selectedConditionColumns:[],
     conditionText:"Công đoạn không dùng Recipe · chỉ khóa theo Main Operation"
    },
    compatibleIds,reasons:{},total:scopedCandidates.length,
    compatible:compatibleIds.length,locked:0
   });
  }

  const rules=await loadProcessTimeRules(c,recipeKey);
  const conditionColumns:string[]=Array.from(new Set<string>(
   rules.flatMap(r=>(r.conditions||[]).map(x=>clean(x.source_column))).filter(Boolean)
  ));
  const conditionById=await loadConditionDataByOperationIds(c,scopedCandidates.map(x=>x.id),conditionColumns);

  let batchData:Record<string,unknown>[]=[];
  let anchorData:Record<string,unknown>|null=null;
  if(source==="BATCH"){
   batchData=await loadBatchMemberConditionData(c,batchId,conditionColumns);
   anchorData=batchData[0]||null;
   if(!anchorData&&Number.isFinite(anchorId)&&anchorId>0){
    anchorData=conditionById.get(anchorId)||null;
   }
  }else{
   anchorData=conditionById.get(anchorId)||null;
  }

  const availableFromRecipe=selectProcessConditionGroupFromRules(rules,anchorData?[anchorData]:[]);
  const storedConditions=source==="BATCH"
   ?await loadStoredBatchCompatibilityConditions(c,batchId)
   :null;
  // Nếu Recipe master đổi sau khi Batch đã tạo, vẫn hiển thị condition đã lưu để
  // Existing Batch không mất compatibility profile lịch sử.
  const availableConditions=mergeConditionsByColumn(availableFromRecipe,storedConditions||[]);

  let selectedConditions:ProcessTimeRuleCondition[]=[];
  if(hasRequestedColumns){
   const requested=requestedColumns||[];
   const availableKeys=new Set(availableConditions.map(x=>up(x.source_column)));
   const unknown=requested.filter(x=>!availableKeys.has(up(x)));
   if(unknown.length){
    return NextResponse.json({error:`Condition không thuộc Recipe hiện tại: ${unknown.join(", ")}.`},{status:400});
   }
   selectedConditions=selectCompatibilityConditionsByColumns(availableConditions,requested);
  }else if(source==="BATCH"&&storedConditions!==null){
   selectedConditions=storedConditions;
  }else{
   // Mặc định an toàn: tích TẤT CẢ condition của Recipe.
   selectedConditions=availableConditions;
  }

  const selectedConditionColumns=selectedConditions.map(x=>x.source_column);
  let invalidSelection="";
  if(source==="BATCH"&&batchData.length&&selectedConditions.length){
   const badIndex=batchData.findIndex(row=>selectedConditions.some(cond=>!processConditionMatches(cond,row)));
   if(badIndex>=0){
    invalidSelection=
     `Không thể bật bộ condition này vì Job hiện có #${badIndex+1} trong Batch không cùng `+
     `${describeCompatibilityConditions(selectedConditions)}.`;
   }
  }

  const compatibleIds:number[]=[];
  const reasons:Record<string,string[]|string>={};
  for(const item of scopedCandidates){
   const why:string[]=[];
   if(clean(item.recipeKey)!==recipeKey)why.push("Khác Recipe");
   if(!why.length&&selectedConditions.length){
    const data=conditionById.get(item.id)||{};
    for(const cond of selectedConditions){
     if(!processConditionMatches(cond,data)){
      why.push(`${cond.source_column}: ${clean(data?.[cond.source_column])||"—"} ≠ ${cond.source_value}`);
     }
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
    source,batchId:source==="BATCH"?batchId:null,
    anchorId:source==="JOB"?anchorId:(anchorId>0?anchorId:null),
    standardOperation,recipeKey,
    recipeNo:rq.rows[0]?.recipe_no||null,
    recipeName:rq.rows[0]?.recipe_name||null,
    conditions:availableConditions,
    selectedConditions,
    selectedConditionColumns,
    conditionText:describeCompatibilityConditions(selectedConditions)
   },
   invalidSelection,
   compatibleIds,reasons,
   total:scopedCandidates.length,
   compatible:compatibleIds.length,
   locked:scopedCandidates.length-compatibleIds.length
  });
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{
  c.release();
 }
}
