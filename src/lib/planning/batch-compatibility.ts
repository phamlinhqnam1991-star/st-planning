import type {PoolClient} from "pg";
import {
 loadProcessTimeRules,
 processConditionMatches,
 processConditionSignature,
 selectProcessConditionGroupFromRules,
 type ProcessTimeRuleCondition
} from "@/lib/planning/batch-utils";

export type RecipeCompatibilityProfile={
 recipeKey:string;
 conditions:ProcessTimeRuleCondition[];
 signature:string;
};

const clean=(v:unknown)=>String(v??"").trim();

export function describeCompatibilityConditions(conditions:ProcessTimeRuleCondition[]){
 if(!conditions.length)return "Chỉ khóa theo Recipe";
 return conditions.map(c=>`${clean(c.source_column)}=${clean(c.source_value)}`).join(" · ");
}

export function normalizeCompatibilityColumns(values:unknown):string[]{
 if(!Array.isArray(values))return [];
 const out:string[]=[];
 const seen=new Set<string>();
 for(const raw of values){
  const v=clean(raw);
  const key=v.toUpperCase();
  if(!v||seen.has(key))continue;
  seen.add(key);
  out.push(v);
 }
 return out;
}

export function selectCompatibilityConditionsByColumns(
 available:ProcessTimeRuleCondition[],
 columns:string[]
){
 const requested=new Set(columns.map(x=>clean(x).toUpperCase()).filter(Boolean));
 return available.filter(c=>requested.has(clean(c.source_column).toUpperCase()));
}

/**
 * Nhóm điều kiện Process Time cụ thể nhất đang khớp Job được truyền vào.
 * Hàm này vẫn hữu ích cho các caller cũ; Batch Compatibility v346 có thể dùng
 * một SUBSET condition do planner chọn.
 */
export async function resolveRecipeCompatibilityProfile(
 c:PoolClient,
 recipeKey:string,
 jobData:Record<string,unknown>[]
):Promise<RecipeCompatibilityProfile>{
 const rules=await loadProcessTimeRules(c,recipeKey);
 const conditions=selectProcessConditionGroupFromRules(rules,jobData);
 return {
  recipeKey,
  conditions,
  signature:processConditionSignature(conditions)
 };
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

export async function loadStoredBatchCompatibilityConditions(
 c:PoolClient,
 batchId:number
):Promise<ProcessTimeRuleCondition[]|null>{
 const q=await c.query(`
  select compatibility_conditions
  from planning_batch
  where id=$1
  limit 1
 `,[batchId]);
 if(!q.rowCount)return null;
 const raw=q.rows[0]?.compatibility_conditions;
 // NULL = Batch legacy/chưa cấu hình → caller mặc định chọn tất cả condition.
 if(raw==null)return null;
 if(!Array.isArray(raw))return [];
 return raw.map((x:any)=>(
  {source_column:clean(x?.source_column),source_value:clean(x?.source_value)}
 )).filter((x:ProcessTimeRuleCondition)=>Boolean(x.source_column));
}

export async function resolveSelectedCompatibilityConditions(
 c:PoolClient,
 args:{
  recipeKey:string;
  jobs:{job_num:string;condition_data:Record<string,unknown>}[];
  anchorJobNum?:string|null;
  targetBatchId?:number|null;
  /** undefined = dùng selection đã lưu/default; [] = planner bỏ chọn mọi condition. */
  requestedConditionColumns?:string[];
 }
):Promise<{
 available:ProcessTimeRuleCondition[];
 selected:ProcessTimeRuleCondition[];
 existingData:Record<string,unknown>[];
}>{
 const jobs=args.jobs||[];
 const rules=await loadProcessTimeRules(c,args.recipeKey);
 if(!rules.length)return {available:[],selected:[],existingData:[]};

 const existingData=args.targetBatchId
  ?await loadBatchCompatibilityJobData(c,Number(args.targetBatchId))
  :[];

 const anchorJob=jobs.find(x=>clean(x.job_num)===clean(args.anchorJobNum))||jobs[0]||null;
 const anchorData=existingData[0] || anchorJob?.condition_data || {};
 // Quan trọng: dùng MỘT Job neo để tìm toàn bộ condition khả dụng. Không dùng
 // toàn Batch vì Batch có thể cố ý trộn condition mà planner đã bỏ tích.
 const available=selectProcessConditionGroupFromRules(rules,[anchorData]);

 let selected:ProcessTimeRuleCondition[];
 if(args.requestedConditionColumns!==undefined){
  const requested=normalizeCompatibilityColumns(args.requestedConditionColumns);
  const availableKeys=new Set(available.map(x=>clean(x.source_column).toUpperCase()));
  const unknown=requested.filter(x=>!availableKeys.has(clean(x).toUpperCase()));
  if(unknown.length){
   throw new Error(`Condition không thuộc Recipe hiện tại: ${unknown.join(", ")}.`);
  }
  selected=selectCompatibilityConditionsByColumns(available,requested);
 }else if(args.targetBatchId){
  const stored=await loadStoredBatchCompatibilityConditions(c,Number(args.targetBatchId));
  selected=stored==null?available:stored;
 }else{
  selected=available;
 }

 return {available,selected,existingData};
}

/**
 * Server-side guard dùng chung bởi Create Batch và Add to Existing Batch.
 * Recipe được kiểm tra riêng ở caller. Condition được kiểm tra theo đúng subset
 * planner đang tích trong Batch Compatibility. Bỏ tích tất cả = chỉ khóa Recipe.
 */
export async function assertSameRecipeConditionGroup(
 c:PoolClient,
 args:{
  recipeKey:string;
  jobs:{job_num:string;condition_data:Record<string,unknown>}[];
  anchorJobNum?:string|null;
  targetBatchId?:number|null;
  requestedConditionColumns?:string[];
 }
):Promise<ProcessTimeRuleCondition[]>{
 const jobs=args.jobs||[];
 if(!jobs.length)return [];
 const {selected,existingData}=await resolveSelectedCompatibilityConditions(c,args);
 if(!selected.length)return [];

 const mismatches:{job_num:string;condition:ProcessTimeRuleCondition}[]=[];
 const test=(jobNum:string,data:Record<string,unknown>)=>{
  for(const cond of selected){
   if(!processConditionMatches(cond,data)){
    mismatches.push({job_num:jobNum,condition:cond});
    return;
   }
  }
 };

 // Khi Add Existing Batch, condition mới bật phải đúng với TOÀN BỘ member cũ.
 existingData.forEach((data,index)=>test(`Job hiện có #${index+1}`,data));
 jobs.forEach(job=>test(job.job_num,job.condition_data||{}));

 if(!mismatches.length)return selected;
 const first=mismatches[0];
 throw new Error(
  `${first.job_num} không thỏa điều kiện gom lô ${first.condition.source_column}=`+
  `${first.condition.source_value}. Điều kiện đang chọn: ${describeCompatibilityConditions(selected)}.`
 );
}
