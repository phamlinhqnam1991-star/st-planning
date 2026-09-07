import type {PoolClient} from "pg";

export type OperationInboxStatus="NEW"|"INACTIVE"|"PARTIAL_CONFIG"|"NOT_ST";

export type OperationInboxRow={
 operation_code:string;
 operation_name:string;
 next_op_jobs:number;
 total_jobs:number;
 parts:number;
 programs:number;
 found_in:string;
 status:OperationInboxStatus;
 scope_type:string|null;
 bridge_count:number;
 mapped_main:string|null;
 mapped_group:string|null;
 suggested_main:string|null;
 suggested_st_group:string|null;
 review_note:string|null;
};

const clean=(v:unknown)=>String(v??"").trim();
const norm=(v:unknown)=>clean(v).toUpperCase();

function splitAllOperation(v:unknown){
 const x=clean(v)
  .replace(/^\[/,"")
  .replace(/\]$/,"")
  .trim();
 if(!x)return [];
 return x
  .split(/\s*\|\s*/)
  .map(s=>s.replace(/^\[/,"").replace(/\]$/,"").trim())
  .filter(Boolean);
}

async function hasReviewTable(c:PoolClient){
 const q=await c.query(`select to_regclass('public.md_operation_review') is not null as ok`);
 return Boolean(q.rows[0]?.ok);
}

async function relationExists(c:PoolClient,name:string){
 const q=await c.query(`select to_regclass($1) is not null as ok`,[`public.${name}`]);
 return Boolean(q.rows[0]?.ok);
}

export async function operationReviewTableExists(c:PoolClient){
 return hasReviewTable(c);
}

export async function ensureOperationReviewTable(c:PoolClient){
 await c.query(`
  create table if not exists public.md_operation_review(
   operation_code text primary key,
   decision text not null,
   note text,
   reviewed_by text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint md_operation_review_decision_check check(decision in ('NOT_ST'))
  )
 `);
 await c.query(`create index if not exists ix_md_operation_review_decision on public.md_operation_review(decision,operation_code)`);
}

export async function clearOperationReview(c:PoolClient,operationCode:string){
 if(!(await hasReviewTable(c)))return;
 await c.query(`delete from public.md_operation_review where upper(trim(operation_code))=upper(trim($1))`,[operationCode]);
}

type Agg={
 operationCode:string;
 jobs:Set<string>;
 nextJobs:Set<string>;
 parts:Set<string>;
 programs:Set<string>;
 hasNext:boolean;
 hasAll:boolean;
};

/**
 * Operation Inbox loader.
 *
 * V532 keeps the V529 business rule but avoids one large cross-table SQL statement.
 * A single optional/older master table can no longer crash the whole Server Component.
 * AllOperation is parsed with the same canonical pipe splitter used by Planning Chain.
 */
export async function loadOperationInbox(c:PoolClient):Promise<{rows:OperationInboxRow[];reviewTableReady:boolean}>{
 const reviewTableReady=await hasReviewTable(c);

 // open_job_current is the only required source for this Inbox.
 const jobsQ=await c.query(`
  select job_num,part_num,program,next_operation,all_operation
  from public.open_job_current
  where is_open=true
 `);

 const agg=new Map<string,Agg>();
 const getAgg=(codeRaw:unknown)=>{
  const code=norm(codeRaw);
  if(!code)return null;
  let a=agg.get(code);
  if(!a){
   a={operationCode:code,jobs:new Set(),nextJobs:new Set(),parts:new Set(),programs:new Set(),hasNext:false,hasAll:false};
   agg.set(code,a);
  }
  return a;
 };

 for(const r of jobsQ.rows as any[]){
  const job=clean(r.job_num);
  const part=clean(r.part_num);
  const program=clean(r.program);
  const next=getAgg(r.next_operation);
  if(next){
   next.hasNext=true;
   if(job){next.jobs.add(job);next.nextJobs.add(job)}
   if(part)next.parts.add(part);
   if(program)next.programs.add(program);
  }
  const seenAll=new Set<string>();
  for(const raw of splitAllOperation(r.all_operation)){
   const code=norm(raw);
   if(!code||seenAll.has(code))continue;
   seenAll.add(code);
   const a=getAgg(code);
   if(!a)continue;
   a.hasAll=true;
   if(job)a.jobs.add(job);
   if(part)a.parts.add(part);
   if(program)a.programs.add(program);
  }
 }

 const scopeByCode=new Map<string,{operation_type:string;is_active:boolean}>();
 if(await relationExists(c,"md_st_operation_scope")){
  const q=await c.query(`select operation_code,operation_type,is_active from public.md_st_operation_scope`);
  for(const r of q.rows as any[]){
   const code=norm(r.operation_code);if(!code)continue;
   const prev=scopeByCode.get(code);
   const row={operation_type:clean(r.operation_type),is_active:Boolean(r.is_active)};
   if(!prev||(!prev.is_active&&row.is_active))scopeByCode.set(code,row);
  }
 }

 const mappingByCode=new Map<string,{standard_operation_rule:string;st_group:string}>();
 if(await relationExists(c,"md_st_operation_mapping")){
  const q=await c.query(`
   select source_operation_code,standard_operation_rule,st_group
   from public.md_st_operation_mapping
   where is_active=true
   order by updated_at desc nulls last,id desc
  `);
  for(const r of q.rows as any[]){
   const code=norm(r.source_operation_code);if(!code||mappingByCode.has(code))continue;
   mappingByCode.set(code,{standard_operation_rule:clean(r.standard_operation_rule),st_group:clean(r.st_group)});
  }
 }

 const bridgeByCode=new Map<string,number>();
 if(await relationExists(c,"md_intermediate_bridge_operation")&&await relationExists(c,"md_intermediate_bridge_segment")){
  const q=await c.query(`
   select upper(trim(bo.operation_code)) operation_code,count(distinct bs.id)::int bridge_count
   from public.md_intermediate_bridge_operation bo
   join public.md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
   group by upper(trim(bo.operation_code))
  `);
  for(const r of q.rows as any[]){const code=norm(r.operation_code);if(code)bridgeByCode.set(code,Number(r.bridge_count||0))}
 }

 const nameByCode=new Map<string,string>();
 if(await relationExists(c,"md_operation")){
  const q=await c.query(`select operation_code,operation_name from public.md_operation where is_active=true`);
  for(const r of q.rows as any[]){
   const code=norm(r.operation_code);if(code&&!nameByCode.has(code))nameByCode.set(code,clean(r.operation_name)||code);
  }
 }

 const reviewByCode=new Map<string,{decision:string;note:string|null}>();
 if(reviewTableReady){
  const q=await c.query(`select operation_code,decision,note from public.md_operation_review`);
  for(const r of q.rows as any[]){const code=norm(r.operation_code);if(code)reviewByCode.set(code,{decision:clean(r.decision),note:r.note?clean(r.note):null})}
 }

 const rows:OperationInboxRow[]=[];
 for(const a of agg.values()){
  const scope=scopeByCode.get(a.operationCode)||null;
  const mapping=mappingByCode.get(a.operationCode)||null;
  const review=reviewByCode.get(a.operationCode)||null;

  const activeType=scope?.is_active?scope.operation_type:"";
  const fullyConfigured=Boolean(
   scope?.is_active&&
   ["PLANNING_OPERATION","INTERMEDIATE","ST_SCOPE_ONLY"].includes(activeType)&&
   (activeType!=="PLANNING_OPERATION"||mapping)
  );
  if(fullyConfigured)continue;

  let status:OperationInboxStatus="NEW";
  if(scope?.is_active&&activeType==="PLANNING_OPERATION"&&!mapping)status="PARTIAL_CONFIG";
  else if(review?.decision==="NOT_ST")status="NOT_ST";
  else if(scope&&!scope.is_active)status="INACTIVE";

  rows.push({
   operation_code:a.operationCode,
   operation_name:nameByCode.get(a.operationCode)||a.operationCode,
   next_op_jobs:a.nextJobs.size,
   total_jobs:a.jobs.size,
   parts:a.parts.size,
   programs:a.programs.size,
   found_in:a.hasNext&&a.hasAll?"NextOperation + AllOperation":a.hasNext?"NextOperation":"AllOperation",
   status,
   scope_type:scope?.operation_type||null,
   bridge_count:bridgeByCode.get(a.operationCode)||0,
   mapped_main:mapping?.standard_operation_rule||null,
   mapped_group:mapping?.st_group||null,
   suggested_main:mapping?.standard_operation_rule||null,
   suggested_st_group:mapping?.st_group||null,
   review_note:review?.note||null,
  });
 }

 rows.sort((x,y)=>{
  const ignored=(x.status==="NOT_ST"?1:0)-(y.status==="NOT_ST"?1:0);
  if(ignored)return ignored;
  return y.next_op_jobs-x.next_op_jobs||y.total_jobs-x.total_jobs||x.operation_code.localeCompare(y.operation_code);
 });

 return {rows,reviewTableReady};
}
