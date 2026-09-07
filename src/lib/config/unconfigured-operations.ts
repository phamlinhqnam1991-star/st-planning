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

async function hasReviewTable(c:PoolClient){
 const q=await c.query(`select to_regclass('public.md_operation_review') is not null as ok`);
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

export async function loadOperationInbox(c:PoolClient):Promise<{rows:OperationInboxRow[];reviewTableReady:boolean}>{
 const reviewTableReady=await hasReviewTable(c);
 const reviewJoin=reviewTableReady
  ?`left join public.md_operation_review rv on upper(trim(rv.operation_code))=a.operation_code`
  :`left join lateral (select null::text decision,null::text note) rv on true`;

 const q=await c.query(`
  with raw_occurrence as (
   select j.job_num,j.part_num,j.program,'NEXT'::text source_kind,
          upper(trim(j.next_operation)) operation_code
   from public.open_job_current j
   where j.is_open=true
     and nullif(trim(coalesce(j.next_operation,'')),'') is not null

   union all

   select j.job_num,j.part_num,j.program,'ALL'::text source_kind,
          upper(trim(x.op)) operation_code
   from public.open_job_current j
   cross join lateral regexp_split_to_table(
    regexp_replace(coalesce(j.all_operation,''),'^\\s*\\[|\\]\\s*$','','g'),
    '\\s*\\|\\s*'
   ) x(op)
   where j.is_open=true
     and nullif(trim(x.op),'') is not null
  ), agg as (
   select operation_code,
          count(distinct job_num)::int total_jobs,
          count(distinct job_num) filter(where source_kind='NEXT')::int next_op_jobs,
          count(distinct part_num)::int parts,
          count(distinct nullif(trim(coalesce(program,'')),''))::int programs,
          bool_or(source_kind='NEXT') has_next,
          bool_or(source_kind='ALL') has_all
   from raw_occurrence
   where nullif(operation_code,'') is not null
   group by operation_code
  ), scope_row as (
   select distinct on (upper(trim(operation_code)))
          upper(trim(operation_code)) operation_code,
          operation_type,is_active
   from public.md_st_operation_scope
   order by upper(trim(operation_code)),is_active desc,updated_at desc nulls last
  ), active_mapping as (
   select distinct on (upper(trim(source_operation_code)))
          upper(trim(source_operation_code)) operation_code,
          standard_operation_rule,st_group
   from public.md_st_operation_mapping
   where is_active=true
   order by upper(trim(source_operation_code)),updated_at desc nulls last,id desc
  ), bridge as (
   select upper(trim(bo.operation_code)) operation_code,count(distinct bs.id)::int bridge_count
   from public.md_intermediate_bridge_operation bo
   join public.md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
   group by upper(trim(bo.operation_code))
  )
  select
   a.operation_code,
   coalesce(op.operation_name,a.operation_code) operation_name,
   a.next_op_jobs,a.total_jobs,a.parts,a.programs,
   case when a.has_next and a.has_all then 'NextOperation + AllOperation'
        when a.has_next then 'NextOperation'
        else 'AllOperation' end found_in,
   case
    when s.is_active=true and s.operation_type='PLANNING_OPERATION' and m.operation_code is null then 'PARTIAL_CONFIG'
    when s.is_active=true and s.operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY') then 'CONFIGURED'
    when coalesce(rv.decision,'')='NOT_ST' then 'NOT_ST'
    when s.operation_code is not null and coalesce(s.is_active,false)=false then 'INACTIVE'
    else 'NEW'
   end status,
   s.operation_type scope_type,
   coalesce(b.bridge_count,0)::int bridge_count,
   m.standard_operation_rule mapped_main,
   m.st_group mapped_group,
   rv.note review_note
  from agg a
  left join scope_row s on s.operation_code=a.operation_code
  left join active_mapping m on m.operation_code=a.operation_code
  left join bridge b on b.operation_code=a.operation_code
  ${reviewJoin}
  left join lateral (
   select o.operation_name
   from public.md_operation o
   where o.is_active=true and upper(trim(o.operation_code))=a.operation_code
   order by o.updated_at desc nulls last
   limit 1
  ) op on true
  where not (coalesce(s.is_active,false)=true and coalesce(s.operation_type,'') in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
             and (s.operation_type<>'PLANNING_OPERATION' or m.operation_code is not null))
  order by
   case when coalesce(rv.decision,'')='NOT_ST' then 1 else 0 end,
   a.next_op_jobs desc,a.total_jobs desc,a.operation_code
 `);

 const rows=(q.rows||[]).map((r:any)=>{
  const code=String(r.operation_code||"").trim().toUpperCase();
  let suggestedMain=r.mapped_main?String(r.mapped_main):null;
  let suggestedGroup=r.mapped_group?String(r.mapped_group):null;
  return {
   operation_code:code,
   operation_name:String(r.operation_name||code),
   next_op_jobs:Number(r.next_op_jobs||0),
   total_jobs:Number(r.total_jobs||0),
   parts:Number(r.parts||0),
   programs:Number(r.programs||0),
   found_in:String(r.found_in||""),
   status:String(r.status||"NEW") as OperationInboxStatus,
   scope_type:r.scope_type?String(r.scope_type):null,
   bridge_count:Number(r.bridge_count||0),
   mapped_main:r.mapped_main?String(r.mapped_main):null,
   mapped_group:r.mapped_group?String(r.mapped_group):null,
   suggested_main:suggestedMain,
   suggested_st_group:suggestedGroup,
   review_note:r.review_note?String(r.review_note):null,
  } satisfies OperationInboxRow;
 });
 return {rows,reviewTableReady};
}
