import Link from "next/link";
import {notFound} from "next/navigation";
import {BatchDetailManager} from "@/components/batch-detail-manager";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpPageHeader,ErpTabs} from "@/components/erp";
import {ST_ERP_MODULES} from "@/lib/erp/st-navigation";
import {getPool} from "@/lib/db";
import {loadLiveRecipeContext,effectiveRecipeKey} from "@/lib/planning/live-recipe";

export const dynamic="force-dynamic";

const formatNumber=(value:unknown, maxDecimals=2)=>{
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/,"");
 return decimal?`${whole},${decimal}`:whole;
};

const hhmm=(minutes:number|null)=>{
 if(minutes==null)return "—";
 const h=Math.floor(minutes/60),m=minutes%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

const batchStatusTone=(value:unknown)=>{
 const status=String(value||"").trim().toUpperCase();
 if(["COMPLETED","DONE"].includes(status))return "erpkit-status-success";
 if(["RUNNING","SCHEDULED"].includes(status))return "erpkit-status-info";
 if(["HOLD","WAITING"].includes(status))return "erpkit-status-warning";
 if(["CANCELLED","ERROR"].includes(status))return "erpkit-status-danger";
 return "erpkit-status-neutral";
};

const batchStatusLabel=(value:unknown)=>{
 const status=String(value||"").trim().toUpperCase();
 if(status==="UNSCHEDULED")return "CHƯA ĐIỀU ĐỘ";
 if(status==="SCHEDULED")return "ĐÃ ĐIỀU ĐỘ";
 if(status==="RUNNING")return "ĐANG CHẠY";
 if(["COMPLETED","DONE"].includes(status))return "HOÀN TẤT";
 if(["HOLD","WAITING"].includes(status))return "ĐANG CHỜ";
 if(status==="CANCELLED")return "ĐÃ HỦY";
 if(status==="ERROR")return "LỖI";
 return status||"—";
};

export default async function Page({
 params,searchParams
}:{
 params:Promise<{id:string}>,
 searchParams:Promise<{next?:string;returnTo?:string;date?:string}>
}){
 const {id}=await params;
 const sp=await searchParams;
 const batchId=Number(id);
 if(!Number.isFinite(batchId))notFound();

 const c=await getPool().connect();
 try{
   const batchQ=await c.query(`
     select
       b.id,b.batch_no,b.planning_date,b.standard_operation,b.recipe_key,
       b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
       b.planned_start,b.planned_end,b.status,b.priority,b.note,
       b.batch_key,
       a.area_name,
       r.recipe_no,r.recipe_name
     from planning_batch b
     left join md_area a on a.id=b.area_id
     left join md_process_recipe r on r.recipe_key=b.recipe_key
     where b.id=$1
   `,[batchId]);

   if(!batchQ.rowCount)notFound();
   const batch=batchQ.rows[0];

   const [jobsQ,candidatesQ]=await Promise.all([
     c.query(`
       select
         bj.id batch_job_id,
         bj.planning_job_operation_id,
         p.id,
         p.job_num,
         p.source_operation_code,
         p.standard_operation,
         p.st_group,
         p.recipe_key,
         p.status planning_status,

         cb.batch_no,
         cb.id batch_id,
         cb.status batch_status,

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

         j.part_num,j.revision_num,j.priority_type,
         j.program,j.part_cluster,j.part_description,

         mf.primer1 part_master_primer1,
         mf.primer2 part_master_primer2,
         mf.primer3 part_master_primer3,
         mf.topcoat1 part_master_topcoat1,
         mf.topcoat2 part_master_topcoat2,
         mf.antiabration part_master_antiabration,
         mf.varinish_name part_master_varnish,

         j.source_data,
         j.prod_qty,j.current_good_wip_qty,j.last_labor_qty,
         j.last_operation,j.next_operation,j.all_operation,
         j.total_surface,j.surface_per_part_dm2,
         j.open_dmr,j.st,j.st_wip_area,j.wip_sequence,
         j.cat35_transit,j.impact_sale_value,
         j.last_import_status,j.first_seen_at,j.last_seen_at,j.last_changed_at,

         coalesce(bj.qty,0) plan_qty,
         coalesce(bj.surface_dm2,0) plan_surface,
         bj.qty,
         bj.surface_dm2,

         coalesce(r.recipe_no,br.recipe_no) recipe_no,
         coalesce(r.recipe_name,br.recipe_name) recipe_name,

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
             from md_part_process_recipe ppr0
             where ppr0.part_num=j.part_num
               and ppr0.revision_num=j.revision_num
               and ppr0.standard_operation=p.standard_operation
               and ppr0.is_active=true
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

       from planning_batch_job bj
       join planning_batch cb
         on cb.id=bj.batch_id
       join planning_job_operation p
         on p.id=bj.planning_job_operation_id
       join open_job_current j
         on j.job_num=bj.job_num

       left join md_material_finish mf
         on mf.part_num=j.part_num
        and mf.revision_num=j.revision_num
        and mf.is_active=true

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
           and hbj.batch_id<>bj.batch_id
           and hbj.standard_operation<>'PIONBL'
           and coalesce(hbj.source_seq_snapshot,hp.source_seq)<p.source_seq
         order by
           coalesce(hbj.source_seq_snapshot,hp.source_seq) desc,
           hb.created_at desc,
           hbj.id desc
         limit 1
       ) prevhist on true

       left join md_process_recipe r
         on r.recipe_key=p.recipe_key
        and r.is_active=true
       left join md_process_recipe br
         on br.recipe_key=cb.recipe_key
        and br.is_active=true

       where bj.batch_id=$1
       order by bj.job_num
     `,[batchId]),
     c.query(`
       select
         p.id,p.job_num,p.source_operation_code,p.standard_operation,p.st_group,p.recipe_key,
         p.status planning_status,

         null::text batch_no,
         null::bigint batch_id,
         null::text batch_status,

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

         j.part_num,j.revision_num,j.priority_type,
         j.program,j.part_cluster,j.part_description,
         mf.primer1 part_master_primer1,
         mf.primer2 part_master_primer2,
         mf.primer3 part_master_primer3,
         mf.topcoat1 part_master_topcoat1,
         mf.topcoat2 part_master_topcoat2,
         mf.antiabration part_master_antiabration,
         mf.varinish_name part_master_varnish,

         j.source_data,
         j.prod_qty,j.current_good_wip_qty,j.last_labor_qty,
         j.last_operation,j.next_operation,j.all_operation,
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

         coalesce(r.recipe_no,br.recipe_no) recipe_no,
         coalesce(r.recipe_name,br.recipe_name) recipe_name,

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
             from md_part_process_recipe ppr0
             where ppr0.part_num=j.part_num
               and ppr0.revision_num=j.revision_num
               and ppr0.standard_operation=p.standard_operation
               and ppr0.is_active=true
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

       from planning_job_operation p
       join open_job_current j on j.job_num=p.job_num

       left join md_material_finish mf
         on mf.part_num=j.part_num
        and mf.revision_num=j.revision_num
        and mf.is_active=true

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

       left join md_process_recipe r on r.recipe_key=p.recipe_key and r.is_active=true
       left join md_process_recipe br on br.recipe_key=$1::text and br.is_active=true
       where p.is_active=true
         and p.status='ELIGIBLE'
         and j.is_open=true
         and p.standard_operation=$2::text
         and (
           $1::text is null
           or p.recipe_key=$1::text
           or (
             p.recipe_key is null
             and exists(
               select 1
               from md_main_operation_recipe ocr
               where ocr.operation_code=p.source_operation_code
                 and ocr.recipe_key=$1::text
                 and ocr.is_active=true
             )
           )
         )
       order by p.job_num
       limit 1000
     `,[batch.recipe_key,batch.standard_operation])
   ]);

   // v262: Job chưa có Recipe → hiển thị Recipe theo CẤU HÌNH HIỆN TẠI
   // (rule → paint → op code best; không cần bấm Rebuild).
   const ctx=await loadLiveRecipeContext(c);
   const recipeMetaQ=await c.query(`
     select recipe_key,recipe_no,recipe_name
     from md_process_recipe
     where is_active=true
   `);
   const recipeMeta=new Map<string,{recipe_no:string|null;recipe_name:string|null}>();
   for(const r of recipeMetaQ.rows){
     recipeMeta.set(r.recipe_key,{recipe_no:r.recipe_no,recipe_name:r.recipe_name});
   }
   for(const row of candidatesQ.rows as any[]){
     const eff=effectiveRecipeKey(ctx,{
       standardOperation:row.standard_operation,
       sourceOperationCode:row.source_operation_code,
       partNum:row.part_num,
       revisionNum:row.revision_num,
       sourceData:row.source_data||null,
       ruleSuggestion:null
     });
     row.effective_recipe_key=eff||null;
     if(!row.recipe_no&&eff){ // v262: chưa có recipe → hiển thị recipe theo cấu hình hiện tại
       const m=recipeMeta.get(eff);
       row.recipe_no=m?.recipe_no||null;
       row.recipe_name=m?.recipe_name||null;
     }
   }

   return <ErpAppShell
    moduleItems={ST_ERP_MODULES}
    activeModule="planning"
    environment="ST PLANNING"
    userArea={<LogoutButton presentation="erp"/>}
    breadcrumb={<><Link href="/planning">Planning Board</Link><span>/</span><Link href="/planning/batches">Batch gần đây</Link><span>/</span><b>{batch.batch_no||"—"}</b></>}
   >
    <div className="planning-erp-version">
     <ErpPageHeader
      eyebrow="PLANNING BOARD"
      title={batch.batch_no||"—"}
      description={`Chi tiết Batch · ${batch.area_name||"—"} · ${batch.standard_operation}`}
      status={<span className={`erpkit-status ${batchStatusTone(batch.status)}`}><span className="erpkit-status-dot"/>{batchStatusLabel(batch.status)}</span>}
      actions={<div className="erpkit-page-actions">
       <Link className="erpkit-btn" href={`/planning-old/batches/${batchId}`}>So sánh giao diện cũ</Link>
       <Link
        className="erpkit-btn"
        href={sp.returnTo==="schedule"
         ? `/schedule${sp.date?`?date=${encodeURIComponent(sp.date)}`:""}`
         : "/planning/batches"}
       >
        ← {sp.returnTo==="schedule"?"Board Điều Độ":"Batch gần đây"}
       </Link>
      </div>}
     />
     <ErpTabs active="batches" items={[
      {key:"matrix",label:"Ma trận kế hoạch",href:"/planning"},
      {key:"batches",label:"Batch gần đây",href:"/planning/batches"},
     ]}/>

     <div className="erpkit-section">
      <div className="planning-batch-detail-summary">
       <div><span>Main Operation</span><b>{batch.standard_operation}</b></div>
       <div><span>Recipe</span><b>{batch.recipe_no?`${batch.recipe_no} · ${batch.recipe_name||""}`:"—"}</b></div>
       <div><span>Batch Key</span><b className="mono">{batch.batch_key||"—"}</b></div>
       <div><span>Số Job</span><b>{batch.total_jobs}</b></div>
       <div><span>Tổng Qty</span><b>{formatNumber(batch.total_qty)}</b></div>
       <div><span>Diện tích</span><b>{formatNumber(batch.total_surface_dm2)} dm²</b></div>
       <div><span>Thời gian xử lý</span><b>{hhmm(batch.process_minutes)}</b></div>
       <div><span>Trạng thái</span><b>{batchStatusLabel(batch.status)}</b></div>
       <div><span>Ưu tiên</span><b>{batch.priority}</b></div>
      </div>
     </div>

     <BatchDetailManager
      batchId={batchId}
      standardOperation={batch.standard_operation}
      planningDate={String(batch.planning_date||"")}
      jobs={jobsQ.rows as any}
      candidates={candidatesQ.rows as any}
      initialNextFilter={sp.next||""}
      presentation="erp"
     />
    </div>
   </ErpAppShell>
 }finally{
   c.release();
 }
}
