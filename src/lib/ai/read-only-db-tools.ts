import type {PoolClient} from "pg";
import {getStLogicReference} from "@/lib/ai/st-planning-knowledge";

export type AiToolAudit={tool:string;summary:string;tables:string[];rows:number};
export type AiToolExecution={content:unknown;audit:AiToolAudit};

type Filter={column:string;op?:string;value?:unknown};

const clean=(v:unknown)=>String(v??"").trim();
const int=(v:unknown,fallback:number,min:number,max:number)=>{
 const n=Math.floor(Number(v));return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
};
const quoteIdent=(v:string)=>`"${v.replace(/"/g,'""')}"`;
const rowsCount=(v:unknown)=>Array.isArray(v)?v.length:0;

async function publicColumns(c:PoolClient,table:string){
 const q=await c.query(`
  select column_name,data_type,udt_name,is_nullable,column_default,ordinal_position
  from information_schema.columns
  where table_schema='public' and table_name=$1
  order by ordinal_position
 `,[table]);
 return q.rows;
}

async function assertPublicTable(c:PoolClient,tableRaw:unknown){
 const table=clean(tableRaw);
 if(!table)throw new Error("Table is required.");
 const q=await c.query(`
  select table_name,table_type
  from information_schema.tables
  where table_schema='public' and table_name=$1
 `,[table]);
 if(!q.rowCount)throw new Error(`Public table/view not found: ${table}`);
 const columns=await publicColumns(c,table);
 return {table,columns,columnSet:new Set(columns.map((x:any)=>clean(x.column_name)))};
}

function buildFilters(filtersRaw:unknown,columnSet:Set<string>,params:unknown[]){
 const filters=Array.isArray(filtersRaw)?filtersRaw.slice(0,8) as Filter[]:[];
 const sql:string[]=[];
 for(const item of filters){
  const column=clean(item?.column);if(!columnSet.has(column))throw new Error(`Unknown filter column: ${column}`);
  const op=clean(item?.op||"eq").toLowerCase();
  const id=quoteIdent(column);
  if(op==="is_null"){sql.push(`${id} is null`);continue;}
  if(op==="not_null"){sql.push(`${id} is not null`);continue;}
  if(op==="in"){
   const list=Array.isArray(item?.value)?item.value.slice(0,30):[];
   if(!list.length){sql.push("false");continue;}
   const refs=list.map(v=>{params.push(v);return `$${params.length}`;});
   sql.push(`${id} in (${refs.join(",")})`);continue;
  }
  params.push(item?.value);const ref=`$${params.length}`;
  if(op==="eq")sql.push(`${id}=${ref}`);
  else if(op==="neq")sql.push(`${id}<>${ref}`);
  else if(op==="ilike")sql.push(`${id}::text ilike ${ref}`);
  else if(op==="contains")sql.push(`${id}::text ilike '%'||${ref}||'%'`);
  else if(op==="gt")sql.push(`${id}>${ref}`);
  else if(op==="gte")sql.push(`${id}>=${ref}`);
  else if(op==="lt")sql.push(`${id}<${ref}`);
  else if(op==="lte")sql.push(`${id}<=${ref}`);
  else throw new Error(`Unsupported filter operator: ${op}`);
 }
 return sql.length?` where ${sql.join(" and ")}`:"";
}

async function readTable(c:PoolClient,args:any):Promise<AiToolExecution>{
 const meta=await assertPublicTable(c,args?.table);
 const requested=Array.isArray(args?.columns)?args.columns.map(clean).filter(Boolean).slice(0,40):[];
 const columns=requested.length?requested:meta.columns.slice(0,30).map((x:any)=>clean(x.column_name));
 for(const column of columns)if(!meta.columnSet.has(column))throw new Error(`Unknown column: ${column}`);
 const params:unknown[]=[];
 const where=buildFilters(args?.filters,meta.columnSet,params);
 const orderBy=clean(args?.orderBy);
 let order="";
 if(orderBy){
  if(!meta.columnSet.has(orderBy))throw new Error(`Unknown orderBy column: ${orderBy}`);
  order=` order by ${quoteIdent(orderBy)} ${clean(args?.direction).toLowerCase()==="desc"?"desc":"asc"}`;
 }
 const limit=int(args?.limit,25,1,50);
 params.push(limit);
 const sql=`select ${columns.map(quoteIdent).join(",")} from public.${quoteIdent(meta.table)}${where}${order} limit $${params.length}`;
 const q=await c.query(sql,params);
 return {
  content:{table:meta.table,columns,rows:q.rows,returned:q.rows.length,limit},
  audit:{tool:"read_table",summary:`Read ${q.rows.length} row(s) from public.${meta.table}`,tables:[meta.table],rows:q.rows.length}
 };
}

async function aggregateTable(c:PoolClient,args:any):Promise<AiToolExecution>{
 const meta=await assertPublicTable(c,args?.table);
 const fn=clean(args?.function||"count").toLowerCase();
 if(!new Set(["count","sum","avg","min","max"]).has(fn))throw new Error(`Unsupported aggregate: ${fn}`);
 const metricColumn=clean(args?.column);
 if(fn!=="count"&&!meta.columnSet.has(metricColumn))throw new Error(`Aggregate column is required/unknown: ${metricColumn}`);
 if(fn==="count"&&metricColumn&&!meta.columnSet.has(metricColumn))throw new Error(`Unknown aggregate column: ${metricColumn}`);
 const groups=Array.isArray(args?.groupBy)?args.groupBy.map(clean).filter(Boolean).slice(0,3):[];
 for(const column of groups)if(!meta.columnSet.has(column))throw new Error(`Unknown groupBy column: ${column}`);
 const params:unknown[]=[];
 const where=buildFilters(args?.filters,meta.columnSet,params);
 const metric=fn==="count"?(metricColumn?`count(${quoteIdent(metricColumn)})`:`count(*)`):`${fn}(${quoteIdent(metricColumn)})`;
 const select=[...groups.map(quoteIdent),`${metric} as value`].join(",");
 const groupSql=groups.length?` group by ${groups.map(quoteIdent).join(",")}`:"";
 const limit=int(args?.limit,25,1,50);params.push(limit);
 const sql=`select ${select} from public.${quoteIdent(meta.table)}${where}${groupSql} order by value desc nulls last limit $${params.length}`;
 const q=await c.query(sql,params);
 return {
  content:{table:meta.table,aggregate:fn,column:metricColumn||null,groupBy:groups,rows:q.rows},
  audit:{tool:"aggregate_table",summary:`Aggregated public.${meta.table} (${fn})`,tables:[meta.table],rows:q.rows.length}
 };
}

async function databaseCatalog(c:PoolClient,args:any):Promise<AiToolExecution>{
 const search=clean(args?.search);const limit=int(args?.limit,80,1,150);
 const q=await c.query(`
  select t.table_name,t.table_type,
         coalesce(s.n_live_tup,0)::bigint estimated_rows,
         (select count(*)::int from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name) column_count
  from information_schema.tables t
  left join pg_stat_user_tables s on s.schemaname='public' and s.relname=t.table_name
  where t.table_schema='public'
    and ($1::text='' or t.table_name ilike '%'||$1||'%')
  order by t.table_name
  limit $2
 `,[search,limit]);
 return {
  content:{schema:"public",search:search||null,tables:q.rows},
  audit:{tool:"database_catalog",summary:`Listed ${q.rows.length} public table/view(s)`,tables:q.rows.map((x:any)=>clean(x.table_name)),rows:q.rows.length}
 };
}

async function tableSchema(c:PoolClient,args:any):Promise<AiToolExecution>{
 const meta=await assertPublicTable(c,args?.table);
 const fk=await c.query(`
  select kcu.column_name,ccu.table_name foreign_table,ccu.column_name foreign_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
  join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.table_schema='public' and tc.table_name=$1 and tc.constraint_type='FOREIGN KEY'
  order by kcu.ordinal_position
 `,[meta.table]);
 const pk=await c.query(`
  select kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema
  where tc.table_schema='public' and tc.table_name=$1 and tc.constraint_type='PRIMARY KEY'
  order by kcu.ordinal_position
 `,[meta.table]);
 return {
  content:{table:meta.table,columns:meta.columns,primaryKey:pk.rows.map((x:any)=>x.column_name),foreignKeys:fk.rows},
  audit:{tool:"table_schema",summary:`Inspected schema for public.${meta.table}`,tables:[meta.table],rows:meta.columns.length}
 };
}

async function jobContext(c:PoolClient,args:any):Promise<AiToolExecution>{
 const jobNum=clean(args?.jobNum);if(!jobNum)throw new Error("jobNum is required.");
 const openQ=await c.query(`select * from public.open_job_current where job_num=$1 limit 1`,[jobNum]);
 if(!openQ.rowCount)return {content:{jobNum,found:false},audit:{tool:"get_job_context",summary:`Job ${jobNum} not found`,tables:["open_job_current"],rows:0}};
 const job=openQ.rows[0];
 const [chainQ,batchQ,routingQ]=await Promise.all([
  c.query(`select * from public.planning_job_operation where job_num=$1 order by planning_seq,source_seq,id`,[jobNum]),
  c.query(`
   select bj.*,b.batch_no,b.planning_date,b.area_id,b.recipe_key batch_recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,b.planned_start batch_planned_start,b.planned_end batch_planned_end,b.priority batch_priority,b.status batch_status,b.note batch_note,
          ps.id schedule_id,ps.schedule_date,ps.resource_code,ps.planned_start schedule_start,ps.planned_end schedule_end,ps.duration_minutes,ps.status schedule_status,
          pe.execution_status,pe.actual_start,pe.actual_end,pe.remark execution_remark
   from public.planning_batch_job bj
   join public.planning_batch b on b.id=bj.batch_id
   left join lateral (select s.* from public.planning_schedule s where s.batch_id=b.id and s.status<>'CANCELLED' order by s.id desc limit 1) ps on true
   left join public.production_execution pe on pe.source_type='BATCH' and pe.source_key='BATCH:'||b.id::text
   where bj.job_num=$1
   order by b.created_at,b.id
  `,[jobNum]).catch(async(e:any)=>{
    if(e?.code!=="42P01")throw e;
    return c.query(`
     select bj.*,b.batch_no,b.planning_date,b.area_id,b.recipe_key batch_recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,b.planned_start batch_planned_start,b.planned_end batch_planned_end,b.priority batch_priority,b.status batch_status,b.note batch_note,
            ps.id schedule_id,ps.schedule_date,ps.resource_code,ps.planned_start schedule_start,ps.planned_end schedule_end,ps.duration_minutes,ps.status schedule_status
     from public.planning_batch_job bj join public.planning_batch b on b.id=bj.batch_id
     left join lateral (select s.* from public.planning_schedule s where s.batch_id=b.id and s.status<>'CANCELLED' order by s.id desc limit 1) ps on true
     where bj.job_num=$1 order by b.created_at,b.id
    `,[jobNum]);
  }),
  job.part_num?c.query(`select * from public.md_routing_detailed where upper(trim(part_num))=upper(trim($1)) and upper(trim(coalesce(revision_num,'')))=upper(trim(coalesce($2,''))) and is_active=true order by source_seq limit 200`,[job.part_num,job.revision_num]):Promise.resolve({rows:[]} as any),
 ]);
 const operations=[...new Set(chainQ.rows.map((x:any)=>clean(x.standard_operation)).filter(Boolean))];
 const [recipeRulesQ,processRecipesQ]=operations.length?await Promise.all([
  c.query(`select * from public.md_main_operation_recipe where operation_code=any($1::text[]) and is_active=true order by operation_code,priority,mapping_id limit 200`,[operations]).catch(()=>Promise.resolve({rows:[]} as any)),
  c.query(`select * from public.md_process_recipe where is_active=true and recipe_key in (select distinct recipe_key from public.planning_job_operation where job_num=$1 and recipe_key is not null) order by recipe_key`,[jobNum]).catch(()=>Promise.resolve({rows:[]} as any)),
 ]):[{rows:[]},{rows:[]}];
 const content={jobNum,found:true,openJob:job,planningChain:chainQ.rows,batchScheduleExecutionHistory:batchQ.rows,routingDetail:routingQ.rows,recipeRules:recipeRulesQ.rows,processRecipes:processRecipesQ.rows};
 const tables=["open_job_current","planning_job_operation","planning_batch_job","planning_batch","planning_schedule","production_execution","md_routing_detailed","md_main_operation_recipe","md_process_recipe"];
 return {content,audit:{tool:"get_job_context",summary:`Loaded full planning context for Job ${jobNum}`,tables,rows:1+chainQ.rows.length+batchQ.rows.length+routingQ.rows.length+recipeRulesQ.rows.length+processRecipesQ.rows.length}};
}

async function batchContext(c:PoolClient,args:any):Promise<AiToolExecution>{
 const batchNo=clean(args?.batchNo);const batchId=Number(args?.batchId);
 if(!batchNo&&!Number.isFinite(batchId))throw new Error("batchNo or batchId is required.");
 const bq=await c.query(`select * from public.planning_batch where ${batchNo?"batch_no=$1":"id=$1"} limit 1`,[batchNo||batchId]);
 if(!bq.rowCount)return {content:{found:false,batchNo:batchNo||null,batchId:Number.isFinite(batchId)?batchId:null},audit:{tool:"get_batch_context",summary:"Batch not found",tables:["planning_batch"],rows:0}};
 const batch=bq.rows[0];const id=Number(batch.id);
 const [jobsQ,scheduleQ,recipeQ,executionQ]=await Promise.all([
  c.query(`select bj.*,oj.* from public.planning_batch_job bj left join public.open_job_current oj on oj.job_num=bj.job_num where bj.batch_id=$1 order by bj.created_at,bj.job_num`,[id]),
  c.query(`select s.*,r.resource_name,r.resource_group,r.area_name from public.planning_schedule s left join public.md_schedule_resource r on r.resource_code=s.resource_code where s.batch_id=$1 order by s.id`,[id]),
  batch.recipe_key?c.query(`select * from public.md_process_recipe where recipe_key=$1 limit 10`,[batch.recipe_key]):Promise.resolve({rows:[]} as any),
  c.query(`select * from public.production_execution where batch_id=$1 order by updated_at desc`,[id]).catch(()=>Promise.resolve({rows:[]} as any)),
 ]);
 const content={found:true,batch,jobs:jobsQ.rows,schedule:scheduleQ.rows,recipe:recipeQ.rows,execution:executionQ.rows};
 const tables=["planning_batch","planning_batch_job","open_job_current","planning_schedule","md_schedule_resource","md_process_recipe","production_execution"];
 return {content,audit:{tool:"get_batch_context",summary:`Loaded Batch ${batch.batch_no||id} context`,tables,rows:1+jobsQ.rows.length+scheduleQ.rows.length+recipeQ.rows.length+executionQ.rows.length}};
}

async function dayOperations(c:PoolClient,args:any):Promise<AiToolExecution>{
 const date=clean(args?.date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("date must be YYYY-MM-DD.");
 const area=clean(args?.area),resource=clean(args?.resource);const limit=int(args?.limit,60,1,100);
 const q=await c.query(`
  select s.*,b.batch_no,b.standard_operation,b.recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,b.status batch_status,
         r.resource_name,r.resource_group,r.area_name,
         pe.execution_status,pe.actual_start,pe.actual_end,
         coalesce(jobs.job_numbers,'{}'::text[]) job_numbers
  from public.planning_schedule s
  join public.planning_batch b on b.id=s.batch_id and b.status<>'CANCELLED'
  left join public.md_schedule_resource r on r.resource_code=s.resource_code
  left join public.production_execution pe on pe.source_type='BATCH' and pe.source_key='BATCH:'||b.id::text
  left join lateral (select array_agg(bj.job_num order by bj.job_num) job_numbers from public.planning_batch_job bj where bj.batch_id=b.id) jobs on true
  where s.status<>'CANCELLED' and s.schedule_date=$1::date
    and ($2::text='' or coalesce(r.area_name,'') ilike '%'||$2||'%')
    and ($3::text='' or s.resource_code ilike '%'||$3||'%')
  order by s.planned_start,b.batch_no
  limit $4
 `,[date,area,resource,limit]).catch(async(e:any)=>{
  if(e?.code!=="42P01")throw e;
  return c.query(`
   select s.*,b.batch_no,b.standard_operation,b.recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,b.status batch_status,
          r.resource_name,r.resource_group,r.area_name,coalesce(jobs.job_numbers,'{}'::text[]) job_numbers
   from public.planning_schedule s join public.planning_batch b on b.id=s.batch_id and b.status<>'CANCELLED'
   left join public.md_schedule_resource r on r.resource_code=s.resource_code
   left join lateral (select array_agg(bj.job_num order by bj.job_num) job_numbers from public.planning_batch_job bj where bj.batch_id=b.id) jobs on true
   where s.status<>'CANCELLED' and s.schedule_date=$1::date
     and ($2::text='' or coalesce(r.area_name,'') ilike '%'||$2||'%')
     and ($3::text='' or s.resource_code ilike '%'||$3||'%')
   order by s.planned_start,b.batch_no limit $4
  `,[date,area,resource,limit]);
 });
 const tables=["planning_schedule","planning_batch","md_schedule_resource","production_execution","planning_batch_job"];
 return {content:{date,area:area||null,resource:resource||null,rows:q.rows},audit:{tool:"get_day_operations",summary:`Loaded ${q.rows.length} scheduled Batch row(s) for ${date}`,tables,rows:q.rows.length}};
}

async function logicReference(args:any):Promise<AiToolExecution>{
 const data=getStLogicReference(clean(args?.topic));
 return {content:data,audit:{tool:"get_logic_reference",summary:`Loaded ST Planning logic reference${args?.topic?` for ${clean(args.topic)}`:""}`,tables:[],rows:data.sections.length}};
}

export const GROQ_READ_ONLY_TOOLS=[
 {type:"function",function:{name:"database_catalog",description:"Discover application tables/views in the public PostgreSQL schema before reading unfamiliar data.",parameters:{type:"object",properties:{search:{type:"string",description:"Optional table-name search text"},limit:{type:"integer",minimum:1,maximum:150}},additionalProperties:false}}},
 {type:"function",function:{name:"table_schema",description:"Inspect columns, primary key and foreign keys of one public application table/view.",parameters:{type:"object",properties:{table:{type:"string"}},required:["table"],additionalProperties:false}}},
 {type:"function",function:{name:"read_table",description:"Safely SELECT rows from any public application table/view. Use filters and a small limit; there is no write capability.",parameters:{type:"object",properties:{table:{type:"string"},columns:{type:"array",items:{type:"string"},maxItems:40},filters:{type:"array",maxItems:8,items:{type:"object",properties:{column:{type:"string"},op:{type:"string",enum:["eq","neq","ilike","contains","in","gt","gte","lt","lte","is_null","not_null"]},value:{}},required:["column"],additionalProperties:false}},orderBy:{type:"string"},direction:{type:"string",enum:["asc","desc"]},limit:{type:"integer",minimum:1,maximum:50}},required:["table"],additionalProperties:false}}},
 {type:"function",function:{name:"aggregate_table",description:"Safely calculate count/sum/avg/min/max, optionally grouped, on any public application table/view.",parameters:{type:"object",properties:{table:{type:"string"},function:{type:"string",enum:["count","sum","avg","min","max"]},column:{type:"string"},groupBy:{type:"array",items:{type:"string"},maxItems:3},filters:{type:"array",maxItems:8,items:{type:"object",properties:{column:{type:"string"},op:{type:"string",enum:["eq","neq","ilike","contains","in","gt","gte","lt","lte","is_null","not_null"]},value:{}},required:["column"],additionalProperties:false}},limit:{type:"integer",minimum:1,maximum:50}},required:["table","function"],additionalProperties:false}}},
 {type:"function",function:{name:"get_job_context",description:"Read a Job's current Open Job row, canonical Planning Chain, Batch/Schedule/Execution history, detailed routing, and related recipe data. Prefer this for questions about a specific Job.",parameters:{type:"object",properties:{jobNum:{type:"string"}},required:["jobNum"],additionalProperties:false}}},
 {type:"function",function:{name:"get_batch_context",description:"Read a Batch, all member Jobs, current open-job details, Schedule/Resource, Recipe and Production Execution. Prefer this for a specific Batch.",parameters:{type:"object",properties:{batchNo:{type:"string"},batchId:{type:"integer"}},additionalProperties:false}}},
 {type:"function",function:{name:"get_day_operations",description:"Read scheduled operational rows for one production date, optionally filtered by Area or Resource. Use for daily workload, delay, or resource questions.",parameters:{type:"object",properties:{date:{type:"string",description:"YYYY-MM-DD"},area:{type:"string"},resource:{type:"string"},limit:{type:"integer",minimum:1,maximum:100}},required:["date"],additionalProperties:false}}},
 {type:"function",function:{name:"get_logic_reference",description:"Read canonical ST Planning business-logic knowledge for Planning Chain, NextOperation, Recipe, Batch, Scheduling, Chemical Line, Painting, Masking/Unmasking, Production Execution, or AI boundaries.",parameters:{type:"object",properties:{topic:{type:"string"}},additionalProperties:false}}},
] as const;

export async function executeGroqReadOnlyTool(c:PoolClient,name:string,args:unknown):Promise<AiToolExecution>{
 const input=args&&typeof args==="object"?args:{};
 if(name==="database_catalog")return databaseCatalog(c,input);
 if(name==="table_schema")return tableSchema(c,input);
 if(name==="read_table")return readTable(c,input);
 if(name==="aggregate_table")return aggregateTable(c,input);
 if(name==="get_job_context")return jobContext(c,input);
 if(name==="get_batch_context")return batchContext(c,input);
 if(name==="get_day_operations")return dayOperations(c,input);
 if(name==="get_logic_reference")return logicReference(input);
 throw new Error(`Unknown read-only AI tool: ${name}`);
}

export function compactToolContent(value:unknown,maxChars=24000){
 const text=JSON.stringify(value);
 if(text.length<=maxChars)return text;
 return JSON.stringify({truncated:true,notice:`Tool output exceeded ${maxChars} characters. Refine the query/filter and call the tool again.`,preview:text.slice(0,maxChars)});
}
