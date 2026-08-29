import {AppTabs} from "@/components/app-tabs";
import {PlanningBoardClient} from "@/components/planning-board-client";
import {PlanningAreaOperationFilter} from "@/components/planning-area-operation-filter";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {healScheduledHandoffs} from "@/lib/planning/unlock-next-after-schedule";
import {visibleOperations} from "@/lib/planning/visible-operations";
import {substituteTemplate} from "@/lib/batch-key-recipe";
import {loadLiveRecipeContext,bestRecipeMatch,mergeJobData} from "@/lib/planning/live-recipe";

export const dynamic="force-dynamic";

export default async function Page({
 searchParams
}:{
 searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>
}){
 const sp=await searchParams;
 const areaId=(sp.area||"").trim();
 const op=(sp.op||"").trim();
 const recipeKey=(sp.recipe||"").trim();
 const previousBatchNo=(sp.prevBatch||"").trim();

 const c=await getPool().connect();
 try{
   // v243: VIEW CÔNG ĐOẠN ST — Candidate Jobs lọc NGAY TRONG SQL theo view
   // (trước limit) để không bị cắt job khi danh sách lớn. Thứ tự OP → AREA → SYSTEM
   // giống client; chưa có view → mặc định = công đoạn ST đã cấu hình (trừ ST_SCOPE_ONLY).
   const viewKeys:string[]=[];
   if(op)viewKeys.push(`OP:${op}`);
   if(areaId)viewKeys.push(`AREA:${areaId}`);
   viewKeys.push("SYSTEM");
   const viewQ=await c.query(
    `select view_key,payload from planning_board_view where view_key=any($1)
     order by array_position($2::text[],view_key)`,
    [viewKeys,viewKeys]
   );
   let stViewCodes:string[]|null=null;
   // v261: truyền Default View xuống client NGAY TỪ SSR — hết cảnh "169 cột hiện ra
   // rồi mới nhảy sang view đã lưu". View khớp = dòng đầu theo thứ tự OP→AREA→SYSTEM.
   let initialView:any=null;
   for(const r of viewQ.rows){
    if(r&&typeof r.payload==="object"){
     const p=r.payload as any;
     if(Array.isArray(p.stView)){
      stViewCodes=p.stView.map((x:unknown)=>String(x).trim().toUpperCase()).filter(Boolean) as string[];
     }
     if(initialView===null){
      initialView={
       columns:Array.isArray(p.columns)?p.columns.filter((x:unknown)=>typeof x==="string"):[],
       stView:Array.isArray(p.stView)?p.stView.map((x:unknown)=>String(x)):undefined,
       filters:(p.filters&&typeof p.filters==="object")?p.filters:{},
       sortRules:Array.isArray(p.sortRules)?p.sortRules:[],
       density:["normal","compact","ultra"].includes(String(p.density||""))?String(p.density):"compact",
       routeFocus:Boolean(p.routeFocus)
      };
     }
    }
   }
   let stViewParams:string[]=[];
   if(stViewCodes===null){
    const defQ=await c.query(`
     select upper(trim(operation_code)) op from md_st_operation_scope
     where is_active=true
     group by upper(trim(operation_code))
     having not bool_or(operation_type='ST_SCOPE_ONLY')`);
    stViewParams=defQ.rows.map((r:any)=>String(r.op));
   }else{
    stViewParams=stViewCodes;
   }

   // Self-heal historical/new Schedule handoffs before Candidate query.
   // A scheduled Main unlocks ONLY its immediate next Main.
   await healScheduledHandoffs(c);

   const [areasQ,opsQ,batchesQ,matrixOpsQ,visibleOpsQ,nextOpsQ]=await Promise.all([
     c.query(`
       select id,area_name
       from md_area
       where is_active=true
       order by sort_order,area_name
     `),
     c.query(`
       select s.standard_operation,s.sort_order,
              om.st_group,
              a.id area_id,a.area_name
       from md_planning_operation_scope s
       left join md_operation_master om
         on om.standard_operation=s.standard_operation
        and om.is_active=true
       left join md_area_operation_group ag
         on ag.st_group=om.st_group
        and ag.is_active=true
       left join md_area a
         on a.id=ag.area_id
        and a.is_active=true
       where s.is_active=true
       order by s.sort_order
     `),
     getRecentPlanningBatches(c,100),
     c.query(`
       select
         s.standard_operation,
         s.sort_order operation_sort,
         om.planning_sort_order,
         om.st_group,
         a.id area_id,
         a.area_name,
         coalesce(a.sort_order,999999) area_sort,
         coalesce(sg.sort_order,999999) st_group_sort
       from md_planning_operation_scope s
       left join md_operation_master om
         on om.standard_operation=s.standard_operation
        and om.is_active=true
       left join md_st_group sg
         on sg.st_group=om.st_group
        and sg.is_active=true
       left join md_area_operation_group ag
         on ag.st_group=om.st_group
        and ag.is_active=true
       left join md_area a
         on a.id=ag.area_id
        and a.is_active=true
       where s.is_active=true
       order by
         coalesce(a.sort_order,999999),
         coalesce(sg.sort_order,999999),
         s.sort_order,
         s.standard_operation
     `),
    visibleOperations(c),
    c.query(`
      select upper(trim(j.next_operation)) operation_code, count(*)::int jobs
      from open_job_current j
      where j.is_open=true
        and nullif(trim(coalesce(j.next_operation,'')),'') is not null
      group by upper(trim(j.next_operation))
      order by jobs desc, operation_code
    `)
   ]);

   const params:any[]=[];
   const conditions=[
     "p.is_active=true",
     "p.status in ('ELIGIBLE','PLANNED')",
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

   // v243: lọc theo VIEW CÔNG ĐOẠN ST (trước limit 5000)
   if(stViewParams.length){
     params.push(stViewParams);
     conditions.push(`upper(trim(j.next_operation)) = any($${params.length}::text[])`);
   }else{
     conditions.push(`1=0`);
   }

   const candidatesQ=await c.query(`
     select
       p.id,p.job_num,p.source_operation_code,p.standard_operation,p.st_group,p.recipe_key,
       p.status planning_status,
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
       j.source_data,
       j.part_cluster,j.part_description,
       j.prod_qty,j.current_good_wip_qty,j.last_labor_qty,
       j.last_operation,

       -- RAW NextOperation shown on Candidate Board.
       -- Source: open_job_current.next_operation <- All Open Job Excel.NextOperation.
       -- This is intentionally independent from ST Operation Mapping.
       j.next_operation,

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
       coalesce(routeinfo.route_status,'[]'::jsonb) route_status,
       (
         p.recipe_key is not null
         or exists(
           select 1
           from md_main_operation_recipe ocr0
           where ocr0.operation_code=p.source_operation_code
             and ocr0.is_active=true
         )
         or exists(
           select 1
           from md_operation_recipe_mapping orm0
           where orm0.standard_operation=p.standard_operation
             and orm0.is_active=true
         )
       ) recipe_required,
       (
         select p2.standard_operation
         from planning_job_operation p2
         where p2.job_num=p.job_num
           and p2.is_active=true
           and p2.planning_seq>p.planning_seq
         order by p2.planning_seq
         limit 1
       ) next_standard_operation,
       coalesce(
         prevp.standard_operation,
         p.previous_standard_operation_snapshot
       ) previous_standard_operation
     from open_job_current j
     join lateral (
       select p0.*
       from planning_job_operation p0
       where p0.job_num=j.job_num
         and p0.is_active=true
         and p0.status in ('ELIGIBLE','PLANNED')
       order by
         -- v173: the shop-floor NextOperation is the authoritative current position.
         -- If its exact Planning Chain row exists, it MUST represent the Candidate.
         -- This fixes NextOperation=CMSA being visually replaced by a later ELIGIBLE Main.
         case
           when upper(trim(coalesce(p0.source_operation_code,'')))=
                upper(trim(coalesce(j.next_operation,'')))
            and p0.status='ELIGIBLE'
           then 0
           else 1
         end,

         -- Otherwise choose the earliest actionable Main.
         case when p0.status='ELIGIBLE' then 0 else 1 end,
         case when p0.status='ELIGIBLE' then p0.planning_seq end asc nulls last,

         -- If no ELIGIBLE exists, show the latest PLANNED Main as history/current state.
         case when p0.status='PLANNED' then p0.planning_seq end desc nulls last,

         p0.id desc
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

     -- v168: md_operation can contain more than one active row for the same
     -- Operation Code. Pick exactly one deterministic row so this lookup
     -- cannot multiply Candidate rows. Operation Code Order remains the
     -- sorting source; Main Operation mapping logic is unchanged.
     left join lateral (
       select mo.planning_sort_order
       from public.md_operation mo
       join public.md_st_operation_scope scope
         on upper(trim(scope.operation_code))=upper(trim(mo.operation_code))
        and scope.is_active=true
       where mo.is_active=true
         and upper(trim(mo.operation_code))=upper(trim(j.next_operation))
       order by
         mo.planning_sort_order asc nulls last,
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
       where pbj.planning_job_operation_id=p.id
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
       where p2.job_num=p.job_num
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
       where hbj.job_num=p.job_num
         and hbj.standard_operation<>'PIONBL'
         and coalesce(hbj.source_seq_snapshot,hp.source_seq)<p.source_seq
       order by
         coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,
         hb.created_at desc,
         hbj.id desc
       limit 1
     ) prevhist on true

     -- v279: Route Matrix chi tiết từng Job từng gây 1 lateral query rất lớn cho
     -- tối đa 10.000 Candidate (Routing Detail + history + jsonb_agg), giữ kết nối
     -- DB 14–54 giây và làm cạn pool toàn app. Candidate chính đã có đầy đủ trạng
     -- thái/current operation; trả mảng rỗng để bảng mở nhanh, không đổi eligibility,
     -- recipe, Batch hay Schedule. Chi tiết route sẽ được tách thành API theo Job ở đợt sau.
     left join lateral (select '[]'::jsonb route_status) routeinfo on true

     -- v169: one ST Group may have more than one active Area mapping.
     -- Candidate is one row per planning_job_operation, so Area lookup must
     -- never multiply the row. Pick one deterministic active Area only.
     left join lateral (
       select ag.area_id
       from md_area_operation_group ag
       join md_area ax
         on ax.id=ag.area_id
        and ax.is_active=true
       where ag.st_group=p.st_group
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
       where rr.recipe_key=p.recipe_key
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
       -- 1) Unplanned / ELIGIBLE first, PLANNED last.
       case when p.status='PLANNED' then 1 else 0 end,

       -- 2) For PLANNED rows, keep every Batch together.
       --    PB-000008 rows stay together, then PB-000009, ...
       case when p.status='PLANNED' then pb.batch_no end nulls first,

       -- 3) Inside ELIGIBLE rows keep current business priority.
       case
         when p.status<>'PLANNED'
          and (
           upper(coalesce(j.priority_type,'')) like '%HIGH%'
           or upper(coalesce(j.priority_type,'')) like '%URGENT%'
          )
         then 0
         when p.status<>'PLANNED' then 1
         else 0
       end,

       -- 4) Stable order inside each Batch / priority group.
       p.job_num
     limit 10000
   `,params);

   let recipeOptions:any[]=[];
   let timeRules:any[]=[];

   if(op){
     const recipeQ=await c.query(`
       select distinct r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,r.recipe_group
       from md_process_recipe r
       where r.is_active=true
         and (
           exists(
             select 1
             from md_operation_recipe_mapping orm
             where orm.standard_operation=$1
               and orm.recipe_key=r.recipe_key
               and orm.is_active=true
           )
           or exists(
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
     `,[op]);
     recipeOptions=recipeQ.rows;
   }

   if(recipeKey){
     const rulesQ=await c.query(`
       select calc_type,priority,qty_min,qty_max,
              surface_min_dm2,surface_max_dm2,
              fixed_hours,standard_hours
       from md_recipe_time_rule
       where recipe_key=$1 and is_active=true
       order by priority,id
     `,[recipeKey]);
     timeRules=rulesQ.rows;
   }

   // v266: Recipe + Mã lô mẫu + Prefix theo CẤU HÌNH HIỆN TẠI (Rule đã gộp vào
   // mapping) — không cần Rebuild, dùng để hiển thị cho Job chưa vào lô.
   const ctx=await loadLiveRecipeContext(c);

   const recipeNameMap=new Map<string,{recipe_no:string|null;recipe_name:string|null}>();
   const recipeMetaQ=await c.query(`
     select recipe_key,recipe_no,recipe_name
     from md_process_recipe
     where is_active=true
   `);
   for(const r of recipeMetaQ.rows){
     recipeNameMap.set(r.recipe_key,{recipe_no:r.recipe_no,recipe_name:r.recipe_name});
   }

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

   const today=new Date().toISOString().slice(0,10);

   return <main className="erp-shell">
    <header className="erp-header">
     <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
     <div className="erp-env">PLANNING BOARD</div>
    </header>

    <AppTabs active="planning"/>

    <section className="erp-content erp-content-full planning-page planning-candidate-page">
     <div className="erp-page-head">
      <div>
       <h2>Planning Board</h2>
       <p>AllOperation sequence → Eligible Jobs → Candidate selection → Production Batch</p>
      </div>
     </div>

     <PlanningViewTabs active="candidates"/>

     <form className="erp-form-panel planning-filter" method="get">
      <PlanningAreaOperationFilter
       areas={areasQ.rows as any}
       operations={opsQ.rows as any}
       initialAreaId={areaId}
       initialOperation={op}
      />

      <label>
       Recipe
       <select className="input" name="recipe" defaultValue={recipeKey}>
        <option value="">All / Not Required</option>
        {recipeOptions.map((r:any)=>
         <option key={r.recipe_key} value={r.recipe_key}>
          {r.recipe_no||"—"} · {r.recipe_name||"CHƯA KHAI BÁO"}
         </option>
        )}
       </select>
      </label>

      <label>
       Previous Batch No
       <input
        className="input"
        name="prevBatch"
        defaultValue={previousBatchNo}
        placeholder="PB-000120"
       />
      </label>

      <button className="btn primary">Load Candidates</button>
     </form>

     {!op&&!areaId&&
      <div className="notice section">
       Chọn Area để xem toàn bộ Candidate thuộc Area, hoặc chọn thêm Standard Operation để lọc chi tiết.
      </div>}


     <div className="section">
      <PlanningBoardClient
       candidates={candidates as any}
       availableBatches={batchesQ.rows as any}
       standardOperation={op}
       areaMode={Boolean(areaId&&!op)}
       selectedAreaId={areaId}
       mainOperations={matrixOpsQ.rows as any}
       stOperations={(visibleOpsQ as any)||[]}
       nextOperations={(nextOpsQ.rows as any)||[]}
       recipeKey={recipeKey}
       timeRules={timeRules as any}
       today={today}
       initialView={initialView}
      />
     </div>
    </section>
   </main>
 }finally{
   c.release();
 }
}
