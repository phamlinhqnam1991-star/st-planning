import type {PoolClient} from "pg";
import {
 loadProcessTimeRules,
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
 if(!conditions.length)return "Không có điều kiện Open Job";
 return conditions.map(c=>`${clean(c.source_column)}=${clean(c.source_value)}`).join(" · ");
}

/**
 * Nhóm điều kiện Process Time cụ thể nhất đang khớp toàn bộ Job được truyền vào.
 * Không phụ thuộc Qty/Surface band; vì các band thời gian có thể đổi khi thêm Job
 * nhưng Batch Compatibility phải giữ ổn định theo Recipe + Open Job conditions.
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

/**
 * Server-side guard dùng chung bởi Create Batch và Add to Existing Batch.
 * Mọi Job mới phải thuộc cùng nhóm điều kiện Process Time với Job neo / Batch.
 * Recipe được kiểm tra riêng ở caller vì recipe live phụ thuộc Operation mapping.
 */
export async function assertSameRecipeConditionGroup(
 c:PoolClient,
 args:{
  recipeKey:string;
  jobs:{job_num:string;condition_data:Record<string,unknown>}[];
  anchorJobNum?:string|null;
  targetBatchId?:number|null;
 }
){
 const jobs=args.jobs||[];
 if(!jobs.length)return;
 const rules=await loadProcessTimeRules(c,args.recipeKey);
 if(!rules.length)return; // Recipe chưa có Process Time conditions → chỉ khóa theo Recipe.

 let anchorData:Record<string,unknown>[]=[];
 if(args.targetBatchId){
  anchorData=await loadBatchCompatibilityJobData(c,Number(args.targetBatchId));
 }
 if(!anchorData.length){
  const anchor=jobs.find(x=>clean(x.job_num)===clean(args.anchorJobNum))||jobs[0];
  anchorData=[anchor.condition_data||{}];
 }

 const expectedConditions=selectProcessConditionGroupFromRules(rules,anchorData);
 const expectedSignature=processConditionSignature(expectedConditions);

 const mismatches:{job_num:string;actual:ProcessTimeRuleCondition[]}[]=[];
 for(const job of jobs){
  const actual=selectProcessConditionGroupFromRules(rules,[job.condition_data||{}]);
  if(processConditionSignature(actual)!==expectedSignature){
   mismatches.push({job_num:job.job_num,actual});
  }
 }
 if(!mismatches.length)return;

 const first=mismatches[0];
 throw new Error(
  `Job ${first.job_num} không cùng điều kiện Recipe với Batch. `+
  `Batch/Job chuẩn: ${describeCompatibilityConditions(expectedConditions)}. `+
  `Job này: ${describeCompatibilityConditions(first.actual)}.`
 );
}
