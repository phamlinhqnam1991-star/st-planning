import type {PoolClient} from "pg";
import {
 matchCondition,
 parseSelectionRule,
 type BatchKeyRuleCondition
} from "@/lib/batch-key-recipe";

export type BatchCompatibilityRuleCondition=BatchKeyRuleCondition;

const clean=(v:unknown)=>String(v??"").trim();
const up=(v:unknown)=>clean(v).toUpperCase();

function normalizeOperator(v:unknown):BatchKeyRuleCondition["operator"]{
 const x=clean(v) as BatchKeyRuleCondition["operator"];
 return ["equals","contains","not_empty","is_empty","starts_with","ends_with"].includes(x)
  ?x
  :"equals";
}

function normalizeCondition(x:any):BatchCompatibilityRuleCondition|null{
 const source_column=clean(x?.source_column??x?.column);
 if(!source_column)return null;
 return {
  id:Number(x?.id)||0,
  source_column,
  operator:normalizeOperator(x?.operator),
  source_value:(x?.source_value??x?.value)==null?null:clean(x?.source_value??x?.value),
  is_active:x?.is_active!==false
 };
}

export function compatibilityConditionMatches(
 cond:BatchCompatibilityRuleCondition,
 row:Record<string,unknown>
){
 return matchCondition(cond,row||{});
}

function describeOne(c:BatchCompatibilityRuleCondition){
 const col=clean(c.source_column);
 const val=clean(c.source_value);
 switch(c.operator){
  case "contains": return `${col} chứa ${val||"—"}`;
  case "not_empty": return `${col} không rỗng`;
  case "is_empty": return `${col} rỗng`;
  case "starts_with": return `${col} bắt đầu bằng ${val||"—"}`;
  case "ends_with": return `${col} kết thúc bằng ${val||"—"}`;
  default: return `${col}=${val||"—"}`;
 }
}

export function describeCompatibilityConditions(conditions:BatchCompatibilityRuleCondition[]){
 if(!conditions.length)return "Chỉ khóa theo Recipe";
 return conditions.map(describeOne).join(" · ");
}

export function normalizeCompatibilityColumns(values:unknown):string[]{
 if(!Array.isArray(values))return [];
 const out:string[]=[];
 const seen=new Set<string>();
 for(const raw of values){
  const v=clean(raw);
  const key=up(v);
  if(!v||seen.has(key))continue;
  seen.add(key);
  out.push(v);
 }
 return out;
}

export function selectCompatibilityConditionsByColumns(
 available:BatchCompatibilityRuleCondition[],
 columns:string[]
){
 const requested=new Set(columns.map(up).filter(Boolean));
 return available.filter(c=>requested.has(up(c.source_column)));
}

/**
 * v348: Batch Compatibility conditions come from the SAME Recipe mapping rule
 * that proposes the Recipe on Planning Board:
 *   md_main_operation_recipe.operation_code + recipe_key -> selection_rule.
 * Process Time conditions are intentionally independent and are NOT used here.
 */
export async function loadRecipeSelectionConditions(
 c:PoolClient,
 recipeKey:string,
 sourceOperationCode:string|null|undefined
):Promise<BatchCompatibilityRuleCondition[]>{
 const op=up(sourceOperationCode);
 if(!recipeKey||!op)return [];
 const q=await c.query(`
  select selection_rule
  from md_main_operation_recipe
  where upper(trim(operation_code))=$1
    and recipe_key=$2
    and is_active=true
  order by priority asc,is_default desc,updated_at asc
  limit 1
 `,[op,recipeKey]);
 if(!q.rowCount)return [];
 return parseSelectionRule(q.rows[0]?.selection_rule?String(q.rows[0].selection_rule):null)
  .filter(x=>x.is_active!==false)
  .map(x=>({...x,source_column:clean(x.source_column)}));
}

export async function loadBatchCompatibilityJobData(c:PoolClient,batchId:number){
 const q=await c.query(`
  select distinct on (j.job_num)
   coalesce(j.source_data,'{}'::jsonb) || (to_jsonb(j)-'source_data') condition_data
  from planning_batch_job bj
  join open_job_current j on j.job_num=bj.job_num
  where bj.batch_id=$1
  order by j.job_num
 `,[batchId]);
 return q.rows.map((r:any)=>(r.condition_data||{}) as Record<string,unknown>);
}

export async function loadBatchAnchorSourceOperation(c:PoolClient,batchId:number){
 const q=await c.query(`
  select source_operation_code
  from planning_batch_job
  where batch_id=$1
    and nullif(trim(source_operation_code),'') is not null
  order by id
  limit 1
 `,[batchId]);
 return clean(q.rows[0]?.source_operation_code)||null;
}

export async function loadStoredBatchCompatibilityConditions(
 c:PoolClient,
 batchId:number
):Promise<BatchCompatibilityRuleCondition[]|null>{
 const q=await c.query(`
  select compatibility_conditions
  from planning_batch
  where id=$1
  limit 1
 `,[batchId]);
 if(!q.rowCount)return null;
 const raw=q.rows[0]?.compatibility_conditions;
 // NULL = Batch legacy/chưa cấu hình -> caller mặc định chọn tất cả condition Recipe.
 if(raw==null)return null;
 if(!Array.isArray(raw))return [];
 return raw.map(normalizeCondition)
  .filter((x:BatchCompatibilityRuleCondition|null):x is BatchCompatibilityRuleCondition=>Boolean(x));
}

function mergeConditionsByColumn(
 primary:BatchCompatibilityRuleCondition[],
 secondary:BatchCompatibilityRuleCondition[]
){
 const out:BatchCompatibilityRuleCondition[]=[];
 const seen=new Set<string>();
 for(const c of [...primary,...secondary]){
  const key=up(c.source_column);
  if(!key||seen.has(key))continue;
  seen.add(key);
  out.push(c);
 }
 return out;
}

export async function resolveSelectedCompatibilityConditions(
 c:PoolClient,
 args:{
  recipeKey:string;
  jobs:{job_num:string;source_operation_code?:string|null;condition_data:Record<string,unknown>}[];
  anchorJobNum?:string|null;
  targetBatchId?:number|null;
  /** undefined = dùng selection đã lưu/default; [] = planner bỏ chọn mọi condition. */
  requestedConditionColumns?:string[];
 }
):Promise<{
 available:BatchCompatibilityRuleCondition[];
 selected:BatchCompatibilityRuleCondition[];
 existingData:Record<string,unknown>[];
}> {
 const jobs=args.jobs||[];
 const existingData=args.targetBatchId
  ?await loadBatchCompatibilityJobData(c,Number(args.targetBatchId))
  :[];

 const anchorJob=jobs.find(x=>clean(x.job_num)===clean(args.anchorJobNum))||jobs[0]||null;
 let sourceOperation=clean(anchorJob?.source_operation_code);
 if(!sourceOperation&&args.targetBatchId){
  sourceOperation=clean(await loadBatchAnchorSourceOperation(c,Number(args.targetBatchId)));
 }

 const mappingConditions=await loadRecipeSelectionConditions(c,args.recipeKey,sourceOperation);
 const stored=args.targetBatchId
  ?await loadStoredBatchCompatibilityConditions(c,Number(args.targetBatchId))
  :null;
 // If mapping was edited after a Batch was created, keep stored columns visible
 // so the historical Batch profile can still be understood/reused safely.
 const available=mergeConditionsByColumn(mappingConditions,stored||[]);

 let selected:BatchCompatibilityRuleCondition[];
 if(args.requestedConditionColumns!==undefined){
  const requested=normalizeCompatibilityColumns(args.requestedConditionColumns);
  const availableKeys=new Set(available.map(x=>up(x.source_column)));
  const unknown=requested.filter(x=>!availableKeys.has(up(x)));
  if(unknown.length){
   throw new Error(`Condition không thuộc Recipe hiện tại: ${unknown.join(", ")}.`);
  }
  selected=selectCompatibilityConditionsByColumns(available,requested);
 }else if(args.targetBatchId){
  selected=stored==null?available:stored;
 }else{
  selected=available;
 }

 return {available,selected,existingData};
}

/**
 * Server-side guard used by Create Batch and Add to Existing Batch.
 * Recipe is checked separately by caller. Conditions use the planner-selected
 * subset of the Recipe mapping selection_rule. Empty subset = Recipe-only lock.
 */
export async function assertSameRecipeConditionGroup(
 c:PoolClient,
 args:{
  recipeKey:string;
  jobs:{job_num:string;source_operation_code?:string|null;condition_data:Record<string,unknown>}[];
  anchorJobNum?:string|null;
  targetBatchId?:number|null;
  requestedConditionColumns?:string[];
 }
):Promise<BatchCompatibilityRuleCondition[]> {
 const jobs=args.jobs||[];
 if(!jobs.length)return [];
 const {selected,existingData}=await resolveSelectedCompatibilityConditions(c,args);
 if(!selected.length)return [];

 const mismatches:{job_num:string;condition:BatchCompatibilityRuleCondition}[]=[];
 const test=(jobNum:string,data:Record<string,unknown>)=>{
  for(const cond of selected){
   if(!compatibilityConditionMatches(cond,data)){
    mismatches.push({job_num:jobNum,condition:cond});
    return;
   }
  }
 };

 existingData.forEach((data,index)=>test(`Job hiện có #${index+1}`,data));
 jobs.forEach(job=>test(job.job_num,job.condition_data||{}));

 if(!mismatches.length)return selected;
 const first=mismatches[0];
 throw new Error(
  `${first.job_num} không thỏa điều kiện gom lô ${describeOne(first.condition)}. `+
  `Điều kiện đang chọn: ${describeCompatibilityConditions(selected)}.`
 );
}
