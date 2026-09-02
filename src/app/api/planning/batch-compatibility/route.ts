import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {getCachedLiveRecipeContext} from "@/lib/planning/planning-static-cache";
import {bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";
import {
 compatibilityConditionMatches,
 describeCompatibilityConditions,
 loadBatchAnchorSourceOperation,
 loadRecipeSelectionConditions,
 loadStoredBatchCompatibilityConditions,
 normalizeCompatibilityColumns,
 selectCompatibilityConditionsByColumns,
 type BatchCompatibilityRuleCondition
} from "@/lib/planning/batch-compatibility";

const clean=(v:unknown)=>String(v??"").trim();
const up=(v:unknown)=>clean(v).toUpperCase();

type CandidateInput={
 id:number;
 recipeKey:string|null;
 recipeMappingId:number|null;
 standardOperation:string;
 sourceOperation:string;
};

// v381: Route Matrix is progressively enriched. In plan-ahead READY cases the
// browser can legitimately reach Batch Compatibility before effective_recipe_key
// has arrived for every occurrence. Never interpret that timing gap as
// "this Main does not use Recipe". Resolve only the missing Recipe values on
// the server from the exact planning_job_operation + current Open Job data.
async function hydrateMissingCandidateRecipes(c:any,input:CandidateInput[]):Promise<CandidateInput[]>{
 const missingIds=input.filter(x=>!clean(x.recipeKey)).map(x=>Number(x.id)).filter(Number.isFinite);
 if(!missingIds.length)return input;

 const q=await c.query(`
  select p.id,p.standard_operation,p.source_operation_code,
         j.part_num,j.revision_num,j.source_data
  from planning_job_operation p
  join open_job_current j on j.job_num=p.job_num and j.is_open=true
  where p.id=any($1::bigint[])
    and p.is_active=true
 `,[missingIds]);
 if(!q.rowCount)return input;

 const ctx=await getCachedLiveRecipeContext(c);
 const resolved=new Map<number,{recipeKey:string|null;recipeMappingId:number|null;standardOperation:string;sourceOperation:string}>();
 for(const r of q.rows){
  const match=bestRecipeMatch(ctx,{
   standardOperation:r.standard_operation,
   sourceOperationCode:r.source_operation_code,
   partNum:r.part_num,
   revisionNum:r.revision_num,
   sourceData:(r.source_data||{}) as Record<string,unknown>,
   ruleSuggestion:null
  });
  resolved.set(Number(r.id),{
   recipeKey:match.recipeKey||null,
   recipeMappingId:match.recipeMappingId||null,
   standardOperation:clean(r.standard_operation),
   sourceOperation:clean(r.source_operation_code)
  });
 }

 return input.map(item=>{
  if(item.recipeKey)return item;
  const live=resolved.get(Number(item.id));
  if(!live)return item;
  return {
   ...item,
   recipeKey:live.recipeKey,
   recipeMappingId:item.recipeMappingId||live.recipeMappingId,
   standardOperation:item.standardOperation||live.standardOperation,
   sourceOperation:item.sourceOperation||live.sourceOperation
  };
 });
}

async function loadConditionDataByOperationIds(c:any,ids:number[],columns:string[]){
 const result=new Map<number,Record<string,unknown>>();
 if(!ids.length)return result;
 const q=await c.query(`
  select p.id,j.part_num,j.revision_num,
         coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
  from planning_job_operation p
  join open_job_current j on j.job_num=p.job_num and j.is_open=true
  where p.id=any($1::bigint[])
    and p.is_active=true
 `,[ids]);
 const ctx=await getCachedLiveRecipeContext(c);
 for(const r of q.rows){
  const data=mergeJobData(ctx,{
   partNum:r.part_num,
   revisionNum:r.revision_num,
   sourceData:(r.condition_data||{}) as Record<string,unknown>
  });
  // Keep only requested columns when possible; matchCondition still receives
  // the exact same values the live Recipe resolver sees, including MD:* data.
  if(columns.length){
   const picked:Record<string,unknown>={};
   for(const col of columns)picked[col]=data[col];
   result.set(Number(r.id),picked);
  }else result.set(Number(r.id),{});
 }
 return result;
}

async function loadBatchMemberConditionData(
 c:any,
 batchId:number,
 columns:string[]
):Promise<Record<string,unknown>[]>{
 const q=await c.query(`
  select bj.id,j.part_num,j.revision_num,
         coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
  from planning_batch_job bj
  join open_job_current j on j.job_num=bj.job_num
  where bj.batch_id=$1
  order by bj.id
 `,[batchId]);
 if(!q.rowCount)return [];
 const ctx=await getCachedLiveRecipeContext(c);
 return q.rows.map((r:any)=>{
  const data=mergeJobData(ctx,{
   partNum:r.part_num,
   revisionNum:r.revision_num,
   sourceData:(r.condition_data||{}) as Record<string,unknown>
  });
  if(!columns.length)return {};
  const picked:Record<string,unknown>={};
  for(const col of columns)picked[col]=data[col];
  return picked;
 });
}

function mergeConditionsByColumn(
 primary:BatchCompatibilityRuleCondition[],
 secondary:BatchCompatibilityRuleCondition[]
){
 const out:BatchCompatibilityRuleCondition[]=[];
 const seen=new Set<string>();
 for(const c of [...primary,...secondary]){
  const column=clean(c.source_column);
  const key=up(column);
  if(!column||seen.has(key))continue;
  seen.add(key);
  out.push({...c,source_column:column});
 }
 return out;
}

export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;

 const body=await req.json().catch(()=>({}));
 const rawCandidates=Array.isArray(body.candidates)?body.candidates:[];
 const candidateInput:CandidateInput[]=rawCandidates.slice(0,5000).map((x:any)=>({
  id:Number(x?.id),
  recipeKey:clean(x?.recipeKey)||null,
  recipeMappingId:Number(x?.recipeMappingId||0)>0?Number(x.recipeMappingId):null,
  standardOperation:clean(x?.standardOperation),
  sourceOperation:clean(x?.sourceOperation)
 })).filter((x:CandidateInput)=>Number.isFinite(x.id)&&x.id>0&&x.standardOperation);
 const anchorId=Number(body.anchorId||0);
 const batchId=Number(body.batchId||0);
 const hasRequestedColumns=Array.isArray(body.selectedConditionColumns);
 const requestedColumns=hasRequestedColumns
  ?normalizeCompatibilityColumns(body.selectedConditionColumns)
  :undefined;

 if(!candidateInput.length)
  return NextResponse.json({profile:null,compatibleIds:[],reasons:{}});
 if(!batchId&&(!Number.isFinite(anchorId)||anchorId<=0))
  return NextResponse.json({error:"Thiếu Job chuẩn hoặc Target Batch."},{status:400});

 const c=await getPool().connect();
 try{
  const candidates=await hydrateMissingCandidateRecipes(c,candidateInput);
  let recipeKey="";
  let recipeMappingId:number|null=null;
  let standardOperation="";
  let anchorSourceOperation="";
  let source:"JOB"|"BATCH"="JOB";

  if(batchId>0){
   const bq=await c.query(`
    select id,batch_no,standard_operation,recipe_key,recipe_mapping_id
    from planning_batch
    where id=$1 and status not in ('CANCELLED','COMPLETED')
    limit 1
   `,[batchId]);
   if(!bq.rowCount)
    return NextResponse.json({error:"Target Batch không tồn tại hoặc đã đóng."},{status:400});
   recipeKey=clean(bq.rows[0].recipe_key);
   standardOperation=clean(bq.rows[0].standard_operation);
   recipeMappingId=Number(bq.rows[0].recipe_mapping_id||0)>0?Number(bq.rows[0].recipe_mapping_id):null;
   source="BATCH";
  }else{
   const anchor=candidates.find(x=>x.id===anchorId);
   if(!anchor)
    return NextResponse.json({error:"Job chuẩn không còn nằm trong Candidate hiện tại."},{status:400});
   recipeKey=clean(anchor.recipeKey);
   standardOperation=clean(anchor.standardOperation);
   anchorSourceOperation=clean(anchor.sourceOperation);
   recipeMappingId=anchor.recipeMappingId;
  }

  const scopedCandidates=candidates.filter(
   x=>up(x.standardOperation)===up(standardOperation)
  );

  if(!scopedCandidates.length){
   return NextResponse.json({
    profile:{source,batchId:source==="BATCH"?batchId:null,anchorId:anchorId>0?anchorId:null,standardOperation,recipeKey,recipeMappingId,recipeNo:null,recipeName:null,conditions:[],selectedConditions:[],selectedConditionColumns:[],conditionText:"Không có Job READY cùng Main Operation"},
    compatibleIds:[],reasons:{},total:0,compatible:0,locked:0
   });
  }

  const anchorCandidate=scopedCandidates.find(x=>x.id===anchorId)||null;
  if(!anchorSourceOperation)anchorSourceOperation=clean(anchorCandidate?.sourceOperation);
  if(!recipeMappingId&&anchorCandidate?.recipeMappingId)recipeMappingId=anchorCandidate.recipeMappingId;
  if(source==="BATCH"&&!anchorSourceOperation){
   anchorSourceOperation=clean(await loadBatchAnchorSourceOperation(c,batchId));
  }

  if(!recipeKey&&source==="BATCH"&&anchorCandidate?.recipeKey){
   recipeKey=clean(anchorCandidate.recipeKey);
  }

  // Main không dùng Recipe: mọi READY cùng Main đều hợp lệ; checkbox trống.
  if(!recipeKey){
   const compatibleIds=scopedCandidates.map(x=>x.id);
   return NextResponse.json({
    profile:{
     source,batchId:source==="BATCH"?batchId:null,anchorId:anchorId>0?anchorId:null,
     standardOperation,recipeKey:"",recipeMappingId:null,recipeNo:null,recipeName:null,
     conditions:[],selectedConditions:[],selectedConditionColumns:[],
     conditionText:"Công đoạn không dùng Recipe · chỉ khóa theo Main Operation"
    },
    compatibleIds,reasons:{},total:scopedCandidates.length,
    compatible:compatibleIds.length,locked:0
   });
  }

  // v348: lấy condition từ Operation Code -> Recipe selection_rule,
  // KHÔNG lấy từ Process Time Rule.
  const mappingConditions=await loadRecipeSelectionConditions(
   c,recipeKey,anchorSourceOperation,recipeMappingId
  );
  const storedConditions=source==="BATCH"
   ?await loadStoredBatchCompatibilityConditions(c,batchId)
   :null;
  const availableConditions=source==="BATCH"
   ?mergeConditionsByColumn(storedConditions||[],mappingConditions)
   :mergeConditionsByColumn(mappingConditions,[]);
  const conditionColumns=availableConditions.map(x=>clean(x.source_column)).filter(Boolean);
  const conditionById=await loadConditionDataByOperationIds(
   c,scopedCandidates.map(x=>x.id),conditionColumns
  );
  const batchData=source==="BATCH"
   ?await loadBatchMemberConditionData(c,batchId,conditionColumns)
   :[];

  let selectedConditions:BatchCompatibilityRuleCondition[]=[];
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
   // Mặc định an toàn: tích tất cả condition của mapping Recipe.
   selectedConditions=availableConditions;
  }

  const selectedConditionColumns=selectedConditions.map(x=>x.source_column);
  let invalidSelection="";
  if(source==="BATCH"&&batchData.length&&selectedConditions.length){
   const badIndex=batchData.findIndex((row:Record<string,unknown>)=>
    selectedConditions.some(cond=>!compatibilityConditionMatches(cond,row))
   );
   if(badIndex>=0){
    invalidSelection=
     `Không thể bật bộ condition này vì Job hiện có #${badIndex+1} trong Batch không thỏa `+
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
     if(!compatibilityConditionMatches(cond,data)){
      why.push(`Không thỏa ${describeCompatibilityConditions([cond])}`);
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
    standardOperation,recipeKey,recipeMappingId,
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
