import type {PoolClient} from "pg";

export type StOutputSource="CHEMMILL"|"FINAL_ST_OPERATION"|"FINSST_CFINM_VN"|"INTERMEDIATE_NO_CHAIN";

export type StOutputImportOption={
 id:string;
 file_name:string|null;
 status:string|null;
 source_rows:number|null;
 created_at:string|null;
 finished_at:string|null;
};

export type StOutputRow={
 output_source:StOutputSource;
 source_rank:number;
 job_num:string;
 part_num:string|null;
 revision_num:string|null;
 program:string|null;
 qty:number;
 surface_per_part_dm2:number|null;
 total_dm2:number;
 next_operation:string|null;
 last_operation:string|null;
 all_operation:string|null;
 final_st_operation:string|null;
 intermediate_operation:string|null;
 batch_id:number|null;
 batch_no:string|null;
 main_operation:string|null;
 source_operation_code:string|null;
 schedule_area:string|null;
 resource_code:string|null;
 scheduled_start:string|null;
 scheduled_end:string|null;
 import_batch_id:string|null;
 import_file_name:string|null;
 import_time:string|null;
 audit_reason:string|null;
 dedup_key:string;
 duplicate_of_source:string|null;
 is_counted:boolean;
};

export type StOutputSummaryRow={
 output_source:StOutputSource;
 jobs:number;
 qty:number;
 total_dm2:number;
 counted_jobs:number;
 counted_qty:number;
 counted_dm2:number;
};

export type StOutputReport={
 reportDate:string;
 cutoffIso:string;
 selectedImportId:string|null;
 importOptions:StOutputImportOption[];
 selectedImport:StOutputImportOption|null;
 rows:StOutputRow[];
 summary:StOutputSummaryRow[];
 total:{jobs:number;qty:number;dm2:number};
 sourceFilter:string;
 countedFilter:string;
 q:string;
 page:number;
 pages:number;
 totalRows:number;
};

const FINAL_OUT_OPS=["FINSST","CFINM-VN"];

function isoDate(value?:string|null){
 const raw=String(value||"").trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date());
}

function cutoffForReportDate(reportDate:string){
 const [y,m,d]=reportDate.split("-").map(Number);
 const utc=Date.UTC(y,m-1,d,20,0,0,0);
 return new Date(utc).toISOString();
}

function normalizeSource(value?:string|null){
 const v=String(value||"").trim().toUpperCase();
 return ["CHEMMILL","FINAL_ST_OPERATION","FINSST_CFINM_VN","INTERMEDIATE_NO_CHAIN"].includes(v)?v:"ALL";
}

function normalizeCounted(value?:string|null){
 const v=String(value||"").trim().toUpperCase();
 return ["COUNTED","EXCLUDED","ALL"].includes(v)?v:"COUNTED";
}

export async function loadStOutputReport(
 c:PoolClient,
 params:{
  date?:string|null;
  importId?:string|null;
  source?:string|null;
  counted?:string|null;
  q?:string|null;
  page?:number|null;
  pageSize?:number|null;
 }={}
):Promise<StOutputReport>{
 const reportDate=isoDate(params.date);
 const cutoffIso=cutoffForReportDate(reportDate);
 const sourceFilter=normalizeSource(params.source);
 const countedFilter=normalizeCounted(params.counted);
 const q=String(params.q||"").trim();
 const pageSize=Math.max(25,Math.min(250,Math.trunc(Number(params.pageSize)||100)));
 const page=Math.max(1,Math.trunc(Number(params.page)||1));

 const importsQ=await c.query(`
  select id::text,file_name,status,source_rows,created_at::text,finished_at::text
  from public.open_job_import_batch
  order by created_at desc
  limit 50
 `);
 const importOptions=importsQ.rows.map((r:any)=>({
  id:String(r.id),
  file_name:r.file_name||null,
  status:r.status||null,
  source_rows:r.source_rows==null?null:Number(r.source_rows),
  created_at:r.created_at||null,
  finished_at:r.finished_at||null,
 })) as StOutputImportOption[];
 const requestedImport=String(params.importId||"").trim();
 const selectedImportId=(requestedImport&&importOptions.some(x=>x.id===requestedImport))
  ?requestedImport
  :(importOptions[0]?.id||null);
 const selectedImport=importOptions.find(x=>x.id===selectedImportId)||null;

 const args:any[]=[cutoffIso,selectedImportId,FINAL_OUT_OPS];
 const filters:string[]=[];
 if(sourceFilter!=="ALL"){args.push(sourceFilter);filters.push(`output_source=$${args.length}`);}
 if(countedFilter==="COUNTED")filters.push(`is_counted=true`);
 if(countedFilter==="EXCLUDED")filters.push(`is_counted=false`);
 if(q){
  args.push(`%${q}%`);
  const n=args.length;
  filters.push(`(
   job_num ilike $${n}
   or coalesce(part_num,'') ilike $${n}
   or coalesce(revision_num,'') ilike $${n}
   or coalesce(program,'') ilike $${n}
   or coalesce(batch_no,'') ilike $${n}
   or coalesce(next_operation,'') ilike $${n}
   or coalesce(final_st_operation,'') ilike $${n}
  )`);
 }
 const where=filters.length?`where ${filters.join(" and ")}`:"";
 const offset=(page-1)*pageSize;

 const cte=`
  with st_ops as (
   select upper(trim(operation_code)) operation_code
   from public.md_st_operation_scope
   where is_active=true
     and operation_type in ('PLANNING_OPERATION','ST_SCOPE_ONLY','INTERMEDIATE')
     and nullif(trim(operation_code),'') is not null
   union
   select distinct upper(trim(bo.operation_code)) operation_code
   from public.md_intermediate_bridge_operation bo
   join public.md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
   where nullif(trim(bo.operation_code),'') is not null
  ), selected_open_job as (
   select j.*
   from public.open_job_current j
   where j.is_open=true
     and ($2::uuid is null or j.last_import_batch_id=$2::uuid)
  ), allop_final as (
   select distinct on (j.job_num)
    j.job_num,
    upper(trim(x.op)) final_st_operation
   from selected_open_job j
   cross join lateral regexp_split_to_table(coalesce(j.all_operation,''),'\\s*(?:→|->|,|;|\\|)+\\s*') with ordinality x(op,ord)
   join st_ops s on s.operation_code=upper(trim(x.op))
   where nullif(trim(x.op),'') is not null
   order by j.job_num,x.ord desc
  ), chain_final as (
   select distinct on (p.job_num)
    p.job_num,p.id planning_job_operation_id,p.standard_operation final_st_operation
   from public.planning_job_operation p
   where p.is_active=true
     and upper(trim(coalesce(p.standard_operation,'')))<>'PIONBL'
   order by p.job_num,p.planning_seq desc nulls last,p.source_seq desc nulls last,p.id desc
  ), raw_rows as (
   select
    case when upper(trim(coalesce(b.standard_operation,p.standard_operation,'')))='CHEMMILL'
      then 'CHEMMILL' else 'FINAL_ST_OPERATION' end output_source,
    case when upper(trim(coalesce(b.standard_operation,p.standard_operation,'')))='CHEMMILL' then 0 else 1 end source_rank,
    bj.job_num,j.part_num,j.revision_num,j.program,
    coalesce(nullif(bj.qty,0),nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
    j.surface_per_part_dm2,
    coalesce(nullif(bj.surface_dm2,0),coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),j.total_surface,0)::numeric total_dm2,
    j.next_operation,j.last_operation,j.all_operation,
    coalesce(cf.final_st_operation,af.final_st_operation) final_st_operation,
    null::text intermediate_operation,
    b.id batch_id,b.batch_no,
    coalesce(b.standard_operation,p.standard_operation) main_operation,
    p.source_operation_code,
    a.area_name schedule_area,
    ps.resource_code,
    ps.planned_start::text scheduled_start,
    coalesce(ps.planned_end,b.planned_end)::text scheduled_end,
    null::uuid import_batch_id,
    null::text import_file_name,
    null::text import_time,
    case when upper(trim(coalesce(b.standard_operation,p.standard_operation,'')))='CHEMMILL'
      then 'CHEMMILL scheduled end <= cutoff'
      else 'Final ST operation scheduled end <= cutoff'
    end audit_reason
   from public.planning_batch_job bj
   join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
   left join public.planning_job_operation p on p.id=bj.planning_job_operation_id
   left join public.open_job_current j on j.job_num=bj.job_num
   left join public.md_area a on a.id=b.area_id
   left join public.planning_schedule ps on ps.batch_id=b.id and ps.status<>'CANCELLED'
   left join chain_final cf on cf.job_num=bj.job_num
   left join allop_final af on af.job_num=bj.job_num
   where coalesce(ps.planned_end,b.planned_end) is not null
     and coalesce(ps.planned_end,b.planned_end)<=$1::timestamptz
     and (
      upper(trim(coalesce(b.standard_operation,p.standard_operation,'')))='CHEMMILL'
      or p.id=cf.planning_job_operation_id
      or (cf.planning_job_operation_id is null and upper(trim(coalesce(p.standard_operation,'')))=upper(trim(coalesce(af.final_st_operation,''))))
     )
   union all
   select
    'FINSST_CFINM_VN' output_source,
    2 source_rank,
    j.job_num,j.part_num,j.revision_num,j.program,
    coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
    j.surface_per_part_dm2,
    coalesce(coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),j.total_surface,0)::numeric total_dm2,
    j.next_operation,j.last_operation,j.all_operation,
    coalesce(cf.final_st_operation,af.final_st_operation) final_st_operation,
    null::text intermediate_operation,
    null::bigint batch_id,null::text batch_no,
    null::text main_operation,
    null::text source_operation_code,
    null::text schedule_area,
    null::text resource_code,
    null::text scheduled_start,
    null::text scheduled_end,
    j.last_import_batch_id import_batch_id,
    ib.file_name import_file_name,
    coalesce(ib.finished_at,ib.created_at)::text import_time,
    'NextOperation = FINSST/CFINM-VN from selected All Open Job import' audit_reason
   from selected_open_job j
   left join chain_final cf on cf.job_num=j.job_num
   left join allop_final af on af.job_num=j.job_num
   left join public.open_job_import_batch ib on ib.id=j.last_import_batch_id
   where upper(trim(coalesce(j.next_operation,'')))=any($3::text[])
   union all
   select
    'INTERMEDIATE_NO_CHAIN' output_source,
    3 source_rank,
    j.job_num,j.part_num,j.revision_num,j.program,
    coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)::numeric qty,
    j.surface_per_part_dm2,
    coalesce(coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)*coalesce(j.surface_per_part_dm2,0),j.total_surface,0)::numeric total_dm2,
    j.next_operation,j.last_operation,j.all_operation,
    coalesce(cf.final_st_operation,af.final_st_operation) final_st_operation,
    j.next_operation intermediate_operation,
    null::bigint batch_id,null::text batch_no,
    null::text main_operation,
    null::text source_operation_code,
    null::text schedule_area,
    null::text resource_code,
    null::text scheduled_start,
    null::text scheduled_end,
    j.last_import_batch_id import_batch_id,
    ib.file_name import_file_name,
    coalesce(ib.finished_at,ib.created_at)::text import_time,
    'Audit INTERMEDIATE_NO_CHAIN + NextOperation belongs to ST' audit_reason
   from selected_open_job j
   left join chain_final cf on cf.job_num=j.job_num
   left join allop_final af on af.job_num=j.job_num
   left join public.open_job_import_batch ib on ib.id=j.last_import_batch_id
   where exists(select 1 from public.md_intermediate_bridge_operation bo where upper(trim(bo.operation_code))=upper(trim(coalesce(j.next_operation,''))))
     and exists(select 1 from st_ops s where s.operation_code=upper(trim(coalesce(j.next_operation,''))))
     and not exists(select 1 from public.planning_job_operation p where p.job_num=j.job_num and p.is_active=true)
  ), ranked as (
   select
    r.*,
    (case when r.output_source='CHEMMILL' then 'CHEMMILL|'||r.job_num else r.job_num end) dedup_key,
    row_number() over(partition by case when r.output_source='CHEMMILL' then 'CHEMMILL|'||r.job_num else r.job_num end order by r.source_rank,r.scheduled_end nulls last,r.batch_id nulls last) dedup_rn,
    first_value(r.output_source) over(partition by case when r.output_source='CHEMMILL' then 'CHEMMILL|'||r.job_num else r.job_num end order by r.source_rank,r.scheduled_end nulls last,r.batch_id nulls last) counted_source
   from raw_rows r
  ), report_rows as (
   select
    *,
    (output_source='CHEMMILL' or dedup_rn=1) is_counted,
    case when output_source<>'CHEMMILL' and dedup_rn>1 then counted_source else null end duplicate_of_source
   from ranked
  )
 `;

 const summaryQ=await c.query(`${cte}
  select
   output_source,
   count(*)::int jobs,
   coalesce(sum(qty),0)::float qty,
   coalesce(sum(total_dm2),0)::float total_dm2,
   count(*) filter(where is_counted)::int counted_jobs,
   coalesce(sum(qty) filter(where is_counted),0)::float counted_qty,
   coalesce(sum(total_dm2) filter(where is_counted),0)::float counted_dm2
  from report_rows
  group by output_source
  order by min(source_rank)
 `,args);

 const totalQ=await c.query(`${cte}
  select
   count(*) filter(where is_counted)::int jobs,
   coalesce(sum(qty) filter(where is_counted),0)::float qty,
   coalesce(sum(total_dm2) filter(where is_counted),0)::float dm2
  from report_rows
 `,args);

 const rowsQ=await c.query(`${cte}
  select *,count(*) over()::int filtered_total
  from report_rows
  ${where}
  order by is_counted desc,source_rank,scheduled_end nulls last,job_num
  limit ${pageSize} offset ${offset}
 `,args);

 const totalRows=Number(rowsQ.rows[0]?.filtered_total||0);
 const rows=rowsQ.rows.map((r:any)=>({
  ...r,
  source_rank:Number(r.source_rank||0),
  qty:Number(r.qty||0),
  surface_per_part_dm2:r.surface_per_part_dm2==null?null:Number(r.surface_per_part_dm2),
  total_dm2:Number(r.total_dm2||0),
  batch_id:r.batch_id==null?null:Number(r.batch_id),
  is_counted:Boolean(r.is_counted),
 })) as StOutputRow[];

 return {
  reportDate,cutoffIso,selectedImportId,importOptions,selectedImport,
  rows,
  summary:summaryQ.rows.map((r:any)=>({
   output_source:r.output_source,
   jobs:Number(r.jobs||0),
   qty:Number(r.qty||0),
   total_dm2:Number(r.total_dm2||0),
   counted_jobs:Number(r.counted_jobs||0),
   counted_qty:Number(r.counted_qty||0),
   counted_dm2:Number(r.counted_dm2||0),
  })),
  total:{
   jobs:Number(totalQ.rows[0]?.jobs||0),
   qty:Number(totalQ.rows[0]?.qty||0),
   dm2:Number(totalQ.rows[0]?.dm2||0),
  },
  sourceFilter,countedFilter,q,page,
  pages:Math.max(1,Math.ceil(totalRows/pageSize)),
  totalRows,
 };
}
