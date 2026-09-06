import type {PoolClient} from "pg";
import {RAW_ST_VISIBLE_CTE_SQL} from "@/lib/planning/raw-st-visible-sql";

export const AUDIT_REASON_LABELS:Record<string,string>={
 ON_BOARD:"Có trên Planning Board",
 NEXT_OPERATION_EMPTY:"NextOperation trống",
 ST_SCOPE_ONLY:"ST_SCOPE_ONLY · chỉ hiển thị All Open Jobs, không tham gia Planning Board",
 OUTSIDE_ST_SCOPE:"NextOperation ngoài ST Planning Scope / active Intermediate Bridge",
 MISSING_MAPPING:"Planning Operation chưa có Source → Main Mapping active",
 INTERMEDIATE_NO_CHAIN:"Intermediate/Bridge thuộc ST nhưng chưa resolve được Planning Chain",
 NO_CHAIN:"Thuộc ST Planning nhưng chưa có Planning Chain active · cần Rebuild/kiểm tra route",
 RAW_CHAIN_MISMATCH:"Có Planning Chain nhưng RAW NextOperation hiện tại không thuộc canonical Planning Board scope",
 NOT_ON_BOARD:"Không thỏa điều kiện population hiện tại của Planning Board",
};

export type OpenJobBoardAuditFilters={
 board?:string;
 job?:string;
 part?:string;
 revision?:string;
 program?:string;
 nextOperation?:string;
 lastOperation?:string;
 mainOperation?:string;
 planningStatus?:string;
 chainRows?:string;
 qtyMin?:string;
 qtyMax?:string;
 surfaceMin?:string;
 surfaceMax?:string;
 importStatus?:string;
 reason?:string;
};

export type OpenJobBoardAuditRow={
 job_num:string;
 part_num:string|null;
 revision_num:string|null;
 program:string|null;
 prod_qty:number|null;
 current_good_wip_qty:number|null;
 total_surface:number|null;
 last_operation:string|null;
 next_operation:string|null;
 last_import_status:string|null;
 planning_board:boolean;
 planning_job_operation_id:number|null;
 current_main_operation:string|null;
 current_source_operation_code:string|null;
 planning_status:string|null;
 is_hold:boolean;
 chain_rows:number;
 raw_scope_type:string|null;
 is_bridge:boolean;
 mapped_main_operation:string|null;
 reason_code:string;
 reason:string;
};

export type OpenJobBoardAuditReason={
 reason_code:string;
 reason:string;
 n:number;
};

export type OpenJobBoardAuditResult={
 summary:any;
 reasons:OpenJobBoardAuditReason[];
 rows:OpenJobBoardAuditRow[];
 total:number;
 page:number;
 pages:number;
 pageSize:number;
};

const AUDIT_CTE=`
with ${RAW_ST_VISIBLE_CTE_SQL}, audit_base as (
 select
  j.job_num,j.part_num,j.revision_num,j.program,
  j.prod_qty,j.current_good_wip_qty,j.total_surface,
  j.last_operation,j.next_operation,j.last_import_status,
  scope.operation_type raw_scope_type,
  (bridge.operation_code is not null) is_bridge,
  map.standard_operation_rule mapped_main_operation,
  p.id planning_job_operation_id,
  p.standard_operation current_main_operation,
  p.source_operation_code current_source_operation_code,
  case when coalesce(p.is_hold,false) then 'HOLD' else p.status end planning_status,
  coalesce(p.is_hold,false) is_hold,
  coalesce(chain.chain_rows,0)::int chain_rows,
  (visible.operation_code is not null) raw_visible
 from public.open_job_current j
 left join active_raw_scope scope
  on scope.operation_code=upper(trim(coalesce(j.next_operation,'')))
 left join active_bridge_raw bridge
  on bridge.operation_code=upper(trim(coalesce(j.next_operation,'')))
 left join visible_st_raw visible
  on visible.operation_code=upper(trim(coalesce(j.next_operation,'')))
 left join lateral (
  select m.standard_operation_rule,m.id
  from public.md_st_operation_mapping m
  where m.is_active=true
    and upper(trim(m.source_operation_code))=upper(trim(coalesce(j.next_operation,'')))
  order by m.updated_at desc nulls last,m.id desc
  limit 1
 ) map on true
 left join lateral (
  select p0.id,p0.standard_operation,p0.source_operation_code,p0.status,p0.is_hold,p0.planning_seq,p0.source_seq
  from public.planning_job_operation p0
  where p0.job_num=j.job_num
    and p0.is_active=true
    and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
  order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
  limit 1
 ) p on true
 left join lateral (
  select count(*)::int chain_rows
  from public.planning_job_operation pc
  where pc.job_num=j.job_num and pc.is_active=true
 ) chain on true
 where j.is_open=true
), audit_rows as (
 select
  b.*,
  (b.raw_visible and b.planning_job_operation_id is not null) planning_board,
  case
   when b.raw_visible and b.planning_job_operation_id is not null then 'ON_BOARD'
   when nullif(trim(coalesce(b.next_operation,'')),'') is null then 'NEXT_OPERATION_EMPTY'
   when b.raw_scope_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
   when b.planning_job_operation_id is not null and not b.raw_visible then 'RAW_CHAIN_MISMATCH'
   when not b.raw_visible then 'OUTSIDE_ST_SCOPE'
   when b.raw_scope_type='PLANNING_OPERATION' and b.mapped_main_operation is null then 'MISSING_MAPPING'
   when b.is_bridge and b.planning_job_operation_id is null then 'INTERMEDIATE_NO_CHAIN'
   when b.planning_job_operation_id is null then 'NO_CHAIN'
   else 'NOT_ON_BOARD'
  end reason_code
 from audit_base b
)
`;

function buildFilterWhere(filters:OpenJobBoardAuditFilters){
 const args:any[]=[];
 const where:string[]=[];
 const addLike=(value:string|undefined,sql:string)=>{
  const v=String(value||"").trim();
  if(!v)return;
  args.push(`%${v}%`);
  where.push(`${sql} ilike $${args.length}`);
 };
 const board=String(filters.board||"").trim().toUpperCase();
 if(board==="YES"||board==="NO"){
  args.push(board==="YES");
  where.push(`a.planning_board=$${args.length}`);
 }
 addLike(filters.job,"a.job_num");
 addLike(filters.part,"coalesce(a.part_num,'')");
 addLike(filters.revision,"coalesce(a.revision_num,'')");
 addLike(filters.program,"coalesce(a.program,'')");
 addLike(filters.nextOperation,"coalesce(a.next_operation,'')");
 addLike(filters.lastOperation,"coalesce(a.last_operation,'')");
 addLike(filters.mainOperation,"coalesce(a.current_main_operation,a.mapped_main_operation,'')");
 const planningStatus=String(filters.planningStatus||"").trim().toUpperCase();
 if(planningStatus){args.push(planningStatus);where.push(`upper(coalesce(a.planning_status,''))=$${args.length}`);}
 const chainRows=String(filters.chainRows||"").trim();
 if(chainRows!==""&&Number.isFinite(Number(chainRows))){args.push(Math.max(0,Math.trunc(Number(chainRows))));where.push(`a.chain_rows=$${args.length}`);}
 const qtyMin=String(filters.qtyMin||"").trim();
 if(qtyMin!==""&&Number.isFinite(Number(qtyMin))){args.push(Number(qtyMin));where.push(`coalesce(nullif(a.current_good_wip_qty,0),a.prod_qty,0)>=$${args.length}`);}
 const qtyMax=String(filters.qtyMax||"").trim();
 if(qtyMax!==""&&Number.isFinite(Number(qtyMax))){args.push(Number(qtyMax));where.push(`coalesce(nullif(a.current_good_wip_qty,0),a.prod_qty,0)<=$${args.length}`);}
 const surfaceMin=String(filters.surfaceMin||"").trim();
 if(surfaceMin!==""&&Number.isFinite(Number(surfaceMin))){args.push(Number(surfaceMin));where.push(`coalesce(a.total_surface,0)>=$${args.length}`);}
 const surfaceMax=String(filters.surfaceMax||"").trim();
 if(surfaceMax!==""&&Number.isFinite(Number(surfaceMax))){args.push(Number(surfaceMax));where.push(`coalesce(a.total_surface,0)<=$${args.length}`);}
 const importStatus=String(filters.importStatus||"").trim().toUpperCase();
 if(importStatus){args.push(importStatus);where.push(`upper(coalesce(a.last_import_status,''))=$${args.length}`);}
 const reason=String(filters.reason||"").trim().toUpperCase();
 if(reason){args.push(reason);where.push(`a.reason_code=$${args.length}`);}
 return {args,where:where.length?`where ${where.join(" and ")}`:""};
}

export async function loadOpenJobBoardAudit(
 c:PoolClient,
 filters:OpenJobBoardAuditFilters,
 page:number,
 pageSize=100
):Promise<OpenJobBoardAuditResult>{
 const safePage=Math.max(1,Math.trunc(page||1));
 const safeSize=Math.max(25,Math.min(250,Math.trunc(pageSize||100)));
 const {args,where}=buildFilterWhere(filters);
 const offset=(safePage-1)*safeSize;

 // Keep the audit read-only and cheap enough for Aiven Free: one canonical
 // scan for the global summary/reason breakdown, then one filtered scan for
 // the requested page. Do not run one full CTE per KPI.
 const summaryQ=await c.query(`${AUDIT_CTE}
  select
   count(*)::int total_open,
   count(*) filter(where planning_board)::int planning_yes,
   count(*) filter(where not planning_board)::int planning_no,
   count(*) filter(where reason_code='ST_SCOPE_ONLY')::int st_scope_only,
   count(*) filter(where reason_code in ('MISSING_MAPPING','INTERMEDIATE_NO_CHAIN','NO_CHAIN','RAW_CHAIN_MISMATCH','NOT_ON_BOARD'))::int st_config_or_chain_issue,
   coalesce((
    select jsonb_agg(jsonb_build_object('reason_code',x.reason_code,'n',x.n) order by x.n desc,x.reason_code)
    from (
     select reason_code,count(*)::int n
     from audit_rows
     where not planning_board
     group by reason_code
    ) x
   ),'[]'::jsonb) reason_counts
  from audit_rows`);

 const rowsQ=await c.query(`${AUDIT_CTE}
  select
   a.job_num,a.part_num,a.revision_num,a.program,
   a.prod_qty,a.current_good_wip_qty,a.total_surface,
   a.last_operation,a.next_operation,a.last_import_status,
   a.planning_board,a.planning_job_operation_id,
   a.current_main_operation,a.current_source_operation_code,
   a.planning_status,a.is_hold,a.chain_rows,
   a.raw_scope_type,a.is_bridge,a.mapped_main_operation,a.reason_code,
   count(*) over()::int filtered_total
  from audit_rows a
  ${where}
  order by
   case when a.planning_board then 1 else 0 end,
   a.reason_code,
   upper(coalesce(a.next_operation,'')),
   a.job_num
  limit ${safeSize} offset ${offset}`,args);

 const summary=summaryQ.rows[0]||{};
 const total=Number(rowsQ.rows[0]?.filtered_total||0);
 const pages=Math.max(1,Math.ceil(total/safeSize));
 const rows=(rowsQ.rows||[]).map((r:any)=>({
  ...r,
  planning_board:Boolean(r.planning_board),
  is_hold:Boolean(r.is_hold),
  chain_rows:Number(r.chain_rows||0),
  reason:AUDIT_REASON_LABELS[String(r.reason_code||"")]||AUDIT_REASON_LABELS.NOT_ON_BOARD,
 })) as OpenJobBoardAuditRow[];
 const rawReasons=Array.isArray(summary.reason_counts)?summary.reason_counts:[];
 return {
  summary,
  reasons:rawReasons.map((r:any)=>({
   reason_code:String(r.reason_code||""),
   reason:AUDIT_REASON_LABELS[String(r.reason_code||"")]||String(r.reason_code||""),
   n:Number(r.n||0),
  })),
  rows,total,page:safePage,pages,pageSize:safeSize,
 };
}
