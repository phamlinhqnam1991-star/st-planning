import {substituteTemplate} from "@/lib/batch-key-recipe";
import {bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";
import {getCachedLiveRecipeContext,getCachedRecipeMeta} from "@/lib/planning/planning-static-cache";
import {getPool} from "@/lib/db";

export type PlanningCandidateQuery={
 areaId:string;
 op:string;
 recipeKey:string;
 previousBatchNo:string;
 requestedPage:number;
 // v298: null = load ALL Candidates (pagination removed). Numeric values keep
 // the legacy paged behavior for backward compatibility.
 pageSize:number|null;
 stViewParams:string[];
 knownTotalCandidates?:number|null;
 // Light mode replaces j.source_data with null. source_data is ~2.8MB of
 // the ~2.9MB payload (643 rows) and is loaded separately only when needed
 // for All Open Source columns.
 light?:boolean;
 // v335: optional delta scope used after Create/Add Batch.
 deltaJobNums?:string[];
};


const CANDIDATE_COUNT_CACHE_TTL_MS=30_000;
const candidateCountCache=new Map<string,{expires:number;total:number}>();

// v327: shared SQL for the metadata-only load (Recipe dropdown + Time Rules).
const RECIPE_OPTIONS_SQL=`
  select distinct r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,r.recipe_group
  from md_process_recipe r
  where r.is_active=true
    and (
      exists(
        select 1
        from planning_job_operation p
        join md_main_operation_recipe ocr
          on ocr.operation_code=p.source_operation_code
         and ocr.recipe_key=r.recipe_key
         and ocr.is_active=true
        where p.standard_operation=$1
          and p.status='ELIGIBLE'
          and p.is_active=true
      )
    )
  order by r.process_family,r.recipe_group,r.recipe_no
`;
const TIME_RULES_SQL=`
  select calc_type,priority,qty_min,qty_max,
         surface_min_dm2,surface_max_dm2,
         fixed_hours,standard_hours
  from md_recipe_time_rule
  where recipe_key=$1 and is_active=true
  order by priority,id
`;

export type PlanningCandidateMetadataQuery={
  op:string;
  recipeKey:string;
};

/**
 * v327: metadata-only Candidate load — Recipe options (dropdown) + Time Rules
 * (Batch panel) WITHOUT the heavy candidates query. Used by
 * /api/planning/candidate-metadata so the board can render filters first and
 * load the heavy rows separately. Runs the two queries in parallel.
 */
export async function loadPlanningCandidateMetadata(c:any,input:PlanningCandidateMetadataQuery){
  const t0=Date.now();
  const {op,recipeKey}=input;
  let recipeOptions:any[]=[];
  let timeRules:any[]=[];
  const sideClient=await getPool().connect();
  try{
    const jobs:Promise<void>[]=[];
    if(op)jobs.push(sideClient.query(RECIPE_OPTIONS_SQL,[op]).then(r=>{recipeOptions=r.rows;}));
    if(recipeKey)jobs.push(sideClient.query(TIME_RULES_SQL,[recipeKey]).then(r=>{timeRules=r.rows;}));
    await Promise.all(jobs);
  }finally{
    sideClient.release();
  }
  return {recipeOptions,timeRules,timing:{totalMs:Date.now()-t0}};
}

function planningCandidateCountCacheKey(input:PlanningCandidateQuery){
 return JSON.stringify([
  input.areaId||"",
  input.op||"",
  input.recipeKey||"",
  input.previousBatchNo||"",
  input.stViewParams||[]
 ]);
}

function readCandidateCountCache(key:string){
 const hit=candidateCountCache.get(key);
 if(!hit)return null;
 if(hit.expires<=Date.now()){candidateCountCache.delete(key);return null;}
 return hit.total;
}

function writeCandidateCountCache(key:string,total:number){
 if(candidateCountCache.size>100){
  const now=Date.now();
  for(const [k,v] of candidateCountCache){if(v.expires<=now)candidateCountCache.delete(k);}
  if(candidateCountCache.size>100)candidateCountCache.delete(candidateCountCache.keys().next().value as string);
 }
 candidateCountCache.set(key,{total,expires:Date.now()+CANDIDATE_COUNT_CACHE_TTL_MS});
}

export async function loadPlanningCandidates(c:any,input:PlanningCandidateQuery){
 const t0=Date.now();
 const {areaId,op,recipeKey,previousBatchNo,requestedPage,pageSize,stViewParams,knownTotalCandidates}=input;
 const lightMode=input.light===true;
 const sourceDataCol=lightMode?"null::jsonb source_data":"j.source_data";
   const params:any[]=[];
   const conditions=[
     "j.is_open=true"
   ];

   if(op){
     params.push(op);
     conditions.push(`p.standard_operation=$${params.length}`);
   }

   if(areaId){
     params.push(Number(areaId));
     conditions.push(`a.id=$${params.length}`);
   }

   if(recipeKey){
     params.push(recipeKey);
     const n=params.length;
     conditions.push(`(
       p.recipe_key=$${n}
       or (
         p.recipe_key is null
         and exists(
           select 1
           from md_main_operation_recipe ocr
           where ocr.operation_code=p.source_operation_code
             and ocr.recipe_key=$${n}
             and ocr.is_active=true
         )
       )
     )`);
   }

   if(previousBatchNo){
     params.push(previousBatchNo);
     conditions.push(`prevhist.previous_batch_no=$${params.length}`);
   }

   // v335: local/delta refresh after Create/Add Batch. Restrict the heavy
   // Candidate SQL to only Jobs changed by the mutation.
   const deltaJobNums=[...new Set((input.deltaJobNums||[]).map(x=>String(x||"").trim()).filter(Boolean))];
   if(deltaJobNums.length){
     params.push(deltaJobNums);
     conditions.push(`j.job_num=any($${params.length}::text[])`);
   }

   // v243: lọc theo VIEW CÔNG ĐOẠN ST trước khi phân trang.
   if(stViewParams.length){
     params.push(stViewParams);
     conditions.push(`upper(trim(j.next_operation)) = any($${params.length}::text[])`);
   }else{
     conditions.push(`1=0`);
   }

   // v294: VIEW CÔNG ĐOẠN ST owns Candidate ROW membership.
   // Start from open_job_current and LEFT JOIN a representative Planning Chain
   // row only to enrich READY / PLANNED / WAIT state. A Job must not disappear
   // merely because all of its planning_job_operation rows are LOCKED (or the
   // chain has not been built yet).
   //
   // Paging-only requests can still send the already-known total, avoiding this
   // second filtered query.
   // v298: ALL mode never runs the filtered COUNT query — the total is simply
   // the number of rows the main query returns. This removes a second full pass
   // over the same heavy lateral-join machinery (roughly half of the old
   // page-load SQL time) and makes pagination obsolete.
   const loadAll=pageSize===null;
   const countCacheKey=planningCandidateCountCacheKey(input);
   const cachedTotal=loadAll?null:readCandidateCountCache(countCacheKey);
   let totalCandidates=loadAll
    ?NaN
    :(knownTotalCandidates!==null&&knownTotalCandidates!==undefined&&Number.isFinite(Number(knownTotalCandidates))
     ?Math.max(0,Math.trunc(Number(knownTotalCandidates)))
     :(cachedTotal??NaN));
   if(!loadAll&&!Number.isFinite(totalCandidates)){
    const countParams=[...params];
    const countQ=await c.query(`
      select count(distinct j.job_num)::int total
      from open_job_current j
      left join lateral (
        select case
          when exists(
            select 1 from md_st_operation_scope s
            where s.is_active=true and s.operation_type='ST_SCOPE_ONLY'
              and upper(trim(s.operation_code))=upper(trim(coalesce(j.next_operation,'')))
          ) then 'ST_SCOPE_ONLY'
          when exists(
            select 1 from md_st_operation_scope s
            where s.is_active=true and s.operation_type='PLANNING_OPERATION'
              and upper(trim(s.operation_code))=upper(trim(coalesce(j.next_operation,'')))
          ) then 'PLANNING_OPERATION'
          when exists(
            select 1
            from md_intermediate_bridge_operation bo
            join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
            where upper(trim(bo.operation_code))=upper(trim(coalesce(j.next_operation,'')))
          ) then 'INTERMEDIATE'
          else null
        end operation_type
      ) nextscope on true
      -- v310: syncPlanningChains already sliced the live chain using the
      -- LastLaborOp + NextOperation resolver: Segment -> AllOperation fallback
      -- -> NO CHAIN. Candidate uses the FIRST live Planning occurrence as
      -- Current Main and never re-resolves from READY/Schedule history.
      left join lateral (
        select p0.*
        from planning_job_operation p0
        where p0.job_num=j.job_num
          and p0.is_active=true
          and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
        order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
        limit 1
      ) p on true
      left join lateral (
        select ag.area_id
        from md_area_operation_group ag
        where ag.st_group=p.st_group and ag.is_active=true
        order by ag.area_id limit 1
      ) candidate_area on true
      left join md_area a on a.id=candidate_area.area_id and a.is_active=true
      left join lateral (
        select hb.batch_no previous_batch_no
        from planning_batch_job hbj
        join planning_batch hb on hb.id=hbj.batch_id and hb.status<>'CANCELLED'
        left join planning_job_operation hp on hp.id=hbj.planning_job_operation_id
        where hbj.job_num=j.job_num
          and p.id is not null
          and hbj.standard_operation<>'PIONBL'
          and coalesce(hbj.source_seq_snapshot,hp.source_seq)<p.source_seq
        order by coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,hb.created_at desc,hbj.id desc
        limit 1
      ) prevhist on true
      where ${conditions.join(" and ")}
    `,countParams);
    totalCandidates=Number(countQ.rows[0]?.total||0);
    writeCandidateCountCache(countCacheKey,totalCandidates);
   }
   const totalPages=loadAll?1:Math.max(1,Math.ceil(totalCandidates/(pageSize as number)));
   const page=loadAll?1:Math.min(requestedPage,totalPages);
   const offset=loadAll?0:(page-1)*(pageSize as number);

   // v325: side queries (recipe options, time rules, live recipe context,
   // recipe meta) run IN PARALLEL with the heavy main candidates query on a
   // second pooled connection. On high-latency links this cuts the first load
   // from ~5 sequential round-trips to ~2 (view, then main ∥ side).
   let recipeOptions:any[]=[];
   let timeRules:any[]=[];
   let ctx:any=null;
   let recipeMetaRows:any[]=[];
   const sideStart=Date.now();
   const sideClient=await getPool().connect();
   const sidePromise=(async()=>{
    const jobs:Promise<void>[]=[];
    if(op){
     jobs.push(sideClient.query(RECIPE_OPTIONS_SQL,[op]).then(r=>{recipeOptions=r.rows;}));
    }
    if(recipeKey){
     jobs.push(sideClient.query(TIME_RULES_SQL,[recipeKey]).then(r=>{timeRules=r.rows;}));
    }
    jobs.push(getCachedLiveRecipeContext(sideClient).then(v=>{ctx=v;}));
    jobs.push(getCachedRecipeMeta(sideClient).then(r=>{recipeMetaRows=r;}));
    await Promise.all(jobs);
   })();

   const candidatesQ=await c.query(`
     select
       -- Candidate row identity must stay numeric for the current client. For
       -- a Job with no live Planning Chain yet use a negative UI-only key.
       -- It is NEVER batch-selectable because planning_status falls back LOCKED.
       coalesce(p.id,-abs(hashtext(j.job_num)::bigint)-1) id,
       j.job_num,
       coalesce(p.source_operation_code,j.next_operation,'') source_operation_code,
       coalesce(p.standard_operation,'') standard_operation,
       p.st_group,p.recipe_key,
       coalesce(p.status,'LOCKED') planning_status,
       (p.id is not null) has_planning_chain,
       p.source_seq,
       pb.batch_no,
       pb.id batch_id,
       pb.status batch_status,
       case
         when prevhist.previous_batch_no is not null then coalesce(prevhist.previous_batch_status,'PLANNED')
         when prevp.standard_operation is not null then coalesce(prevp.status,'—')
         when p.previous_standard_operation_snapshot is not null then 'NO BATCH'
         else null
       end previous_planning_status,
       coalesce(
         prevp.standard_operation,
         prevhist.previous_batch_operation,
         p.previous_standard_operation_snapshot
       ) previous_planning_operation,
       prevhist.previous_batch_no,
       prevhist.previous_batch_id,
       prevhist.previous_batch_status,
       prevhist.previous_batch_operation,
       prevhist.previous_batch_source_operation,
       prevhist.previous_batch_source_seq,
       j.part_num,j.revision_num,j.program,j.priority_type,
       mf.primer1 part_master_primer1,
       mf.primer2 part_master_primer2,
       mf.primer3 part_master_primer3,
       mf.topcoat1 part_master_topcoat1,
       mf.topcoat2 part_master_topcoat2,
       mf.antiabration part_master_antiabration,
       mf.varinish_name part_master_varnish,
       ${sourceDataCol},
       j.part_cluster,j.part_description,
       j.prod_qty,j.current_good_wip_qty,j.last_labor_qty,
       j.last_operation,

       -- RAW NextOperation shown on Candidate Board.
       -- Source: open_job_current.next_operation <- All Open Job Excel.NextOperation.
       -- This is intentionally independent from ST Operation Mapping.
       j.next_operation,
       nextscope.operation_type next_operation_type,
       case when nextscope.operation_type='INTERMEDIATE' then nullif(p.previous_standard_operation_snapshot,'') else null end intermediate_previous_main,
       case when nextscope.operation_type='INTERMEDIATE' then nullif(p.standard_operation,'') else null end intermediate_next_main,

       j.all_operation,
       nextopmaster.planning_sort_order next_operation_planning_sort_order,
       j.total_surface,j.surface_per_part_dm2,
       j.open_dmr,j.st,j.st_wip_area,j.wip_sequence,
       j.cat35_transit,j.impact_sale_value,
       j.last_import_status,j.first_seen_at,j.last_seen_at,j.last_changed_at,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) plan_qty,
       coalesce(
         j.total_surface,
         coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0)
           * coalesce(j.surface_per_part_dm2,0),
         0
       ) plan_surface,
       a.area_name,
       coalesce(r.recipe_no,selected_r.recipe_no) recipe_no,
       coalesce(r.recipe_name,selected_r.recipe_name) recipe_name,
       '[]'::jsonb route_status,
       false route_status_loaded,
       (
         p.id is not null
         and (
         p.recipe_key is not null
         or exists(
           select 1
           from md_main_operation_recipe ocr0
           where upper(trim(ocr0.operation_code))=upper(trim(p.source_operation_code))
             and ocr0.is_active=true
             and exists(
               select 1 from md_process_recipe r0
               where r0.recipe_key=ocr0.recipe_key and r0.is_active=true
             )
         )
         or exists(
           select 1
           from md_part_process_recipe ppr0
           where ppr0.part_num=j.part_num
             and ppr0.revision_num=j.revision_num
             and ppr0.standard_operation=p.standard_operation
             and ppr0.is_active=true
             and exists(
               select 1 from md_process_recipe r1
               where r1.recipe_key=ppr0.recipe_key and r1.is_active=true
             )
         )
         )
       ) recipe_required,
       case when p.id is not null then (
         select p2.standard_operation
         from planning_job_operation p2
         where p2.job_num=p.job_num
           and p2.is_active=true
           and p2.planning_seq>p.planning_seq
         order by p2.planning_seq
         limit 1
       ) else null end next_standard_operation,
       coalesce(
         prevp.standard_operation,
         p.previous_standard_operation_snapshot
       ) previous_standard_operation
     from open_job_current j
     left join lateral (
       select case
         when exists(
           select 1 from md_st_operation_scope s
           where s.is_active=true and s.operation_type='ST_SCOPE_ONLY'
             and upper(trim(s.operation_code))=upper(trim(coalesce(j.next_operation,'')))
         ) then 'ST_SCOPE_ONLY'
         when exists(
           select 1 from md_st_operation_scope s
           where s.is_active=true and s.operation_type='PLANNING_OPERATION'
             and upper(trim(s.operation_code))=upper(trim(coalesce(j.next_operation,'')))
         ) then 'PLANNING_OPERATION'
         when exists(
           select 1
           from md_intermediate_bridge_operation bo
           join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
           where upper(trim(bo.operation_code))=upper(trim(coalesce(j.next_operation,'')))
         ) then 'INTERMEDIATE'
         else null
       end operation_type
     ) nextscope on true
     -- v310: Current Main comes from the chain suffix positioned by
     -- LastLaborOp + NextOperation. Segment is tried first; when no Segment
     -- matches, AllOperation selects the nearest upcoming Main. No live row
     -- means NO CHAIN. Later rows are Next Main(s).
     left join lateral (
       select p0.*
       from planning_job_operation p0
       where p0.job_num=j.job_num
         and p0.is_active=true
         and p0.status in ('LOCKED','ELIGIBLE','PLANNED')
       order by p0.planning_seq asc,p0.source_seq asc,p0.id asc
       limit 1
     ) p on true

     -- v169 invariant: master lookups may enrich a Candidate but must never
     -- multiply it. Select one active material-finish record deterministically.
     left join lateral (
       select m.*
       from md_material_finish m
       where m.part_num=j.part_num
         and m.revision_num=j.revision_num
         and m.is_active=true
       limit 1
     ) mf on true

     -- v347: Next Op Sort belongs to the RAW All Open Job.NextOperation code.
     -- Do NOT require md_st_operation_scope here: Bridge Intermediate operations
     -- (INSPLM, SCRB-CM, UNMSK-CM, INSPCM, ...) may be valid sort codes without
     -- their own active ST Scope row. md_operation.planning_sort_order is the
     -- single source of truth for Planning Board Next Operation sorting.
     -- LATERAL + LIMIT 1 also protects Candidate cardinality if historical
     -- duplicate md_operation rows exist for the same normalized code.
     left join lateral (
       select mo.planning_sort_order
       from public.md_operation mo
       where mo.is_active=true
         and upper(trim(mo.operation_code))=upper(trim(j.next_operation))
       order by
         mo.planning_sort_order asc nulls last,
         mo.updated_at desc nulls last,
         mo.operation_code asc
       limit 1
     ) nextopmaster on true

     -- Current/latest active Batch of this exact planning operation.
     -- Use LATERAL + LIMIT 1 so one planning operation can never duplicate
     -- the Candidate row even if historical planning_batch_job rows exist.
     left join lateral (
       select
         hb.id,
         hb.batch_no,
         hb.status
       from planning_batch_job pbj
       join planning_batch hb
         on hb.id=pbj.batch_id
        and hb.status<>'CANCELLED'
       where p.id is not null
         and pbj.planning_job_operation_id=p.id
       order by
         case
          when upper(coalesce(hb.status,'')) in ('SCHEDULED','PLANNED','UNSCHEDULED') then 0
          else 1
         end,
         hb.created_at desc,
         pbj.id desc
       limit 1
     ) pb on true

     -- Previous planning operation for Candidate display/filter.
     left join lateral (
       select p2.standard_operation,p2.status
       from planning_job_operation p2
       where p.id is not null
         and p2.job_num=j.job_num
         and p2.is_active=true
         and p2.standard_operation<>'PIONBL'
         and p2.planning_seq<p.planning_seq
       order by p2.planning_seq desc
       limit 1
     ) prevp on true

     -- Most recent previous Main Operation batch for this Job.
     left join lateral (
       select
         hb.id previous_batch_id,
         hb.batch_no previous_batch_no,
         hb.status previous_batch_status,
         hp.standard_operation previous_batch_operation,
         hbj.source_operation_code previous_batch_source_operation,
         coalesce(hbj.source_seq_snapshot,hp.source_seq) previous_batch_source_seq
       from planning_batch_job hbj
       join planning_batch hb
         on hb.id=hbj.batch_id
        and hb.status<>'CANCELLED'
       left join planning_job_operation hp
         on hp.id=hbj.planning_job_operation_id
       where p.id is not null
         and hbj.job_num=j.job_num
         and hbj.standard_operation<>'PIONBL'
         and coalesce(hbj.source_seq_snapshot,hp.source_seq)<p.source_seq
       order by
         coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,
         hb.created_at desc,
         hbj.id desc
       limit 1
     ) prevhist on true


     -- v283: Route Matrix is lazy-loaded by /api/planning/route-status.
     -- Candidate metadata must not execute the heavy per-row route_status LATERAL.


     -- v169: one ST Group may have more than one active Area mapping.
     -- Candidate is one row per planning_job_operation, so Area lookup must
     -- never multiply the row. Pick one deterministic active Area only.
     left join lateral (
       select ag.area_id
       from md_area_operation_group ag
       join md_area ax
         on ax.id=ag.area_id
        and ax.is_active=true
       where p.id is not null
         and ag.st_group=p.st_group
         and ag.is_active=true
       order by
         ax.sort_order asc nulls last,
         ax.area_name asc,
         ag.area_id asc
       limit 1
     ) candidate_area on true
     left join md_area a
       on a.id=candidate_area.area_id
      and a.is_active=true
     left join lateral (
       select rr.recipe_no,rr.recipe_name
       from md_process_recipe rr
       where p.id is not null
         and rr.recipe_key=p.recipe_key
         and rr.is_active=true
       limit 1
     ) r on true
     left join lateral (
       select rr.recipe_no,rr.recipe_name
       from md_process_recipe rr
       where rr.recipe_key=${recipeKey?`$${params.findIndex(x=>x===recipeKey)+1}`:"null"}
         and rr.is_active=true
       limit 1
     ) selected_r on true
     where ${conditions.join(" and ")}
     order by
       -- v347: SQL order is ONLY a stable pagination/transport order.
       -- Planning Board presentation sort is owned entirely by sortRules on
       -- the client. In particular, do not hard-code Next Operation or Priority
       -- here because that would make progressive pages appear pre-sorted by a
       -- rule the planner did not choose.
       j.job_num asc,
       p.source_seq asc nulls last,
       p.id asc nulls last
     ${loadAll?"":"limit $"+(params.length+1)+" offset $"+(params.length+2)}
   `,loadAll?params:[...params,pageSize,offset]);
   const queryMs=Date.now()-t0;
   try{
    await sidePromise;
   }finally{
    sideClient.release();
   }
   const recipeMs=Date.now()-sideStart;

   const recipeNameMap=new Map<string,{recipe_no:string|null;recipe_name:string|null}>();
   for(const r of recipeMetaRows){
     recipeNameMap.set(r.recipe_key,{recipe_no:r.recipe_no,recipe_name:r.recipe_name});
   }
   const mapStart=Date.now();

   const candidates=(candidatesQ.rows as any[]).map((row:any)=>{
     // v266: recipe "đúng theo cấu hình hiện tại" của Job (paint theo Part → op code best).
     const match=bestRecipeMatch(ctx,{
       standardOperation:row.standard_operation,
       sourceOperationCode:row.source_operation_code,
       partNum:row.part_num,
       revisionNum:row.revision_num,
       sourceData:row.source_data||null,
       ruleSuggestion:null
     });
     const effective=match.recipeKey;

     // Job ĐÃ vào lô (PLANNED) → hiện recipe thật của lô (p.recipe_key).
     // Job CHƯA vào lô (ELIGIBLE) → hiện recipe theo cấu hình hiện tại.
     const displayKey=row.planning_status==="PLANNED"
       ? (row.recipe_key||null)
       : (effective||row.recipe_key||null);
     const dmeta=recipeNameMap.get(displayKey||"");

     return {
       ...row,
       effective_recipe_key:effective,
       batch_key_suggest:substituteTemplate(match.batchKeyTemplate,mergeJobData(ctx,{partNum:row.part_num,revisionNum:row.revision_num,sourceData:row.source_data||null})),
       batch_prefix_suggest:match.batchNoPrefix,
       recipe_key:displayKey,
       recipe_no:dmeta?.recipe_no||null,
       recipe_name:dmeta?.recipe_name||null
     };
   });
 if(loadAll){
  totalCandidates=candidates.length;
 }
 const totalMs=Date.now()-t0;
 return {
  candidates,recipeOptions,timeRules,
  pagination:{page,pageSize:loadAll?candidates.length:(pageSize as number),totalCandidates,totalPages},
  timing:{queryMs,recipeMs,mapMs:Date.now()-mapStart,totalMs}
 };
}
