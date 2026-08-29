import {getPool} from "@/lib/db";
import {AppTabs} from "@/components/app-tabs";
import {ConfigSidebar,ConfigPageHeader} from "@/components/config-nav";
import {AutoPlanningRuleManager} from "@/components/auto-planning-rule-manager";

export const dynamic="force-dynamic";


const BASE_FIELDS=[
 ["priority_type","Priority","All Open Job.priority_type"],
 ["next_standard_operation","Next Main Plan Op","Planning Chain"],
 ["next_operation","NextOperation","All Open Job.next_operation"],
 ["previous_standard_operation","Previous Main Plan Op","Planning Chain"],
 ["previous_batch_no","Previous Batch No","Planning Batch history"],
 ["recipe_no","Recipe No","Process Recipe Master"],
 ["recipe_name","Recipe Name","Process Recipe Master"],
 ["part_num","Part Num","All Open Job"],
 ["revision_num","Revision","All Open Job"],
 ["program","Program","All Open Job"],
 ["primer1","Part Master PRIMER1","md_material_finish.primer1"],
 ["primer2","Part Master PRIMER2","md_material_finish.primer2"],
 ["primer3","Part Master PRIMER3","md_material_finish.primer3"],
 ["plan_qty","Qty / pcs","Current WIP Qty / Prod Qty"],
 ["plan_surface","Surface dm²","Calculated Candidate surface"],
 ["job_num","Job","All Open Job"],
 ["last_operation","LastLaborOp","All Open Job"],
 ["open_dmr","Open DMR","All Open Job"],
] as const;

const COLUMN_NOTES=[
 ["standard_operation","TEXT","Rule áp dụng cho công đoạn chính nào."],
 ["auto_plan_enabled","BOOLEAN","Công tắc bật/tắt Auto Planning của operation."],
 ["auto_plan_mode","OFF / SUGGEST / FULL_AUTO","OFF không chạy; SUGGEST chỉ đề xuất; FULL_AUTO cho phép engine tạo Batch tự động."],
 ["auto_plan_order","INTEGER","Thứ tự engine xử lý các Standard Operation khi chạy Auto Planning."],
 ["allow_first_plan_operation","BOOLEAN","Cho phép Auto Plan khi Previous Main Plan Op = START."],
 ["allow_actual_wip_without_previous_batch","BOOLEAN","Cho phép Job đang Actual WIP tại operation hiện tại được Auto Plan dù chưa có Previous Batch."],
 ["allow_from_previous_batch","BOOLEAN","Cho phép Job vào Auto Plan vì công đoạn chính trước đã có Batch."],
 ["allow_plan_ahead","BOOLEAN","YES: Previous Batch chỉ cần PLANNED; chưa cần hoàn thành thực tế."],
 ["require_previous_completed","BOOLEAN","YES: phải xác nhận công đoạn trước Completed trước khi Auto Plan."],
 ["require_same_recipe","BOOLEAN","Các Job trong cùng Auto Batch phải có cùng Recipe."],
 ["group_by_previous_batch","BOOLEAN","Ưu tiên/gom Job theo Previous Batch No."],
 ["require_same_part","BOOLEAN","Các Job trong cùng Batch phải cùng Part."],
 ["require_same_revision","BOOLEAN","Các Job trong cùng Batch phải cùng Revision."],
 ["require_same_program","BOOLEAN","Các Job trong cùng Batch phải cùng Program."],
 ["require_same_primer1/2/3","BOOLEAN","Bắt buộc cùng giá trị Part Master PRIMER tương ứng."],
 ["recipe_required","BOOLEAN","Loại Job chưa resolve được Recipe."],
 ["exclude_open_dmr","BOOLEAN","Loại Job có Open DMR/Hold."],
 ["min_jobs_per_batch / max_jobs_per_batch","NUMBER","Giới hạn số Job mỗi Batch; để trống = không áp dụng."],
 ["min_qty_per_batch / max_qty_per_batch","NUMBER","Giới hạn tổng pcs mỗi Batch; để trống = không áp dụng."],
 ["min_surface_dm2_per_batch / max_surface_dm2_per_batch","NUMBER","Giới hạn tổng Surface dm² mỗi Batch; để trống = không áp dụng."],
 ["split_on_recipe","BOOLEAN","Recipe thay đổi thì mở Batch mới."],
 ["split_on_previous_batch","BOOLEAN","Previous Batch thay đổi thì mở Batch mới."],
 ["split_on_part / split_on_revision","BOOLEAN","Part hoặc Revision thay đổi thì mở Batch mới."],
 ["split_on_program","BOOLEAN","Program thay đổi thì mở Batch mới."],
 ["split_on_primer1/2/3","BOOLEAN","PRIMER tương ứng thay đổi thì mở Batch mới."],
 ["allow_empty_batch","BOOLEAN","Cho phép tạo lô trống Jobs=0 để plan-ahead trước khi WIP tới."],
 ["allow_schedule_empty_batch","BOOLEAN","Cho phép điều độ lô trống trước rồi Fill Job sau."],
 ["auto_create_empty_batch","BOOLEAN","Cho phép Auto Batch tương lai tự tạo lô trống. v87 chưa tự chạy."],
 ["auto_fill_scheduled_batch","BOOLEAN","Cho phép Auto Fill tương lai tự đưa Candidate vào lô đã điều độ. v87 chưa tự chạy."],
 ["require_recipe_before_schedule","BOOLEAN","Auto Schedule tương lai chỉ schedule khi Batch đã có Recipe."],
 ["require_paint_type_before_schedule","BOOLEAN","Auto Schedule tương lai chỉ schedule lô sơn khi đã xác định Paint Type."],
 ["batch_lock_before_start_minutes","INTEGER","Cutoff tương lai: khóa Add/Remove Job trước giờ chạy N phút; 0 = chưa tự khóa."],
 ["priority_rules","JSONB","Danh sách tối đa 10 cấp Sort Priority trước khi engine gom Batch."],
 ["note","TEXT","Ghi chú nghiệp vụ riêng của operation."],
] as const;

export default async function Page(){
 const c=await getPool().connect();
 try{
  const [rulesQ,sourceKeysQ]=await Promise.all([
   c.query(`
    select
      o.standard_operation,o.st_group,
      coalesce(r.auto_plan_enabled,false) auto_plan_enabled,
      coalesce(r.auto_plan_mode,'OFF') auto_plan_mode,
      coalesce(r.auto_plan_order,100) auto_plan_order,

      coalesce(r.allow_first_plan_operation,true) allow_first_plan_operation,
      coalesce(r.allow_actual_wip_without_previous_batch,true) allow_actual_wip_without_previous_batch,
      coalesce(r.allow_from_previous_batch,true) allow_from_previous_batch,
      coalesce(r.allow_plan_ahead,true) allow_plan_ahead,
      coalesce(r.require_previous_completed,false) require_previous_completed,

      coalesce(r.require_same_recipe,false) require_same_recipe,
      coalesce(r.group_by_previous_batch,false) group_by_previous_batch,
      coalesce(r.require_same_part,false) require_same_part,
      coalesce(r.require_same_revision,false) require_same_revision,
      coalesce(r.require_same_program,false) require_same_program,
      coalesce(r.require_same_primer1,false) require_same_primer1,
      coalesce(r.require_same_primer2,false) require_same_primer2,
      coalesce(r.require_same_primer3,false) require_same_primer3,

      coalesce(r.recipe_required,false) recipe_required,
      coalesce(r.exclude_open_dmr,false) exclude_open_dmr,

      r.min_jobs_per_batch,r.max_jobs_per_batch,
      r.min_qty_per_batch,r.max_qty_per_batch,
      r.min_surface_dm2_per_batch,r.max_surface_dm2_per_batch,

      coalesce(r.split_on_recipe,false) split_on_recipe,
      coalesce(r.split_on_previous_batch,false) split_on_previous_batch,
      coalesce(r.split_on_part,false) split_on_part,
      coalesce(r.split_on_revision,false) split_on_revision,
      coalesce(r.split_on_program,false) split_on_program,
      coalesce(r.split_on_primer1,false) split_on_primer1,
      coalesce(r.split_on_primer2,false) split_on_primer2,
      coalesce(r.split_on_primer3,false) split_on_primer3,

      coalesce(r.allow_empty_batch,true) allow_empty_batch,
      coalesce(r.allow_schedule_empty_batch,true) allow_schedule_empty_batch,
      coalesce(r.auto_create_empty_batch,false) auto_create_empty_batch,
      coalesce(r.auto_fill_scheduled_batch,false) auto_fill_scheduled_batch,
      coalesce(r.require_recipe_before_schedule,false) require_recipe_before_schedule,
      coalesce(r.require_paint_type_before_schedule,false) require_paint_type_before_schedule,
      coalesce(r.batch_lock_before_start_minutes,0) batch_lock_before_start_minutes,

      coalesce(r.priority_rules,'[]'::jsonb) priority_rules,
      r.note
    from md_operation_master o
    left join md_auto_planning_rule r
      on r.standard_operation=o.standard_operation
     and r.is_active=true
    where o.is_active=true
    order by
      coalesce(r.auto_plan_order,100),
      o.standard_operation
   `),
   c.query(`
    select distinct k.key
    from (
      select source_data
      from open_job_current
      where is_open=true
      order by last_seen_at desc nulls last
      limit 500
    ) j
    cross join lateral jsonb_object_keys(j.source_data) k(key)
    order by k.key
    limit 500
   `).catch(()=>({rows:[]} as any))
  ]);

  const fields=[
   ...BASE_FIELDS.map(([key,label,source])=>({key,label,source})),
   ...sourceKeysQ.rows.map((x:any)=>({
    key:`source:${String(x.key)}`,
    label:String(x.key),
    source:"All Open Job.source_data"
   }))
  ];

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
    <div className="erp-env">CONFIGURATION</div>
   </header>

   <AppTabs active="config"/>

   <div className="erp-workspace">
    <ConfigSidebar active="autoplanning"/>

    <section className="erp-content erp-content-full">
     <ConfigPageHeader
      title="Auto Planning Rule Master"
      subtitle="Thiết lập riêng cho từng Standard Operation · Engine tương lai chỉ đọc Rule Master này."
      purpose="Cấu hình quy tắc tự động gom lô cho từng công đoạn chính: job nào được gom, gom theo tiêu chí nào, giới hạn lô ra sao, ưu tiên xếp lô thế nào."
      impact="Phần lớn các cờ hiện là cấu hình nền cho Auto Planning tương lai (chưa tự chạy). Batch Key / Recipe Rules là phần đang hoạt động ngay trên Planning Board."
      prev={{label:"Batch Key / Recipe Rules",href:"/batch-key-recipe-rules"}}
     />

     <div className="notice auto-rule-logic-note">
      <b>Eligibility nền:</b>{" "}
      Actual WIP có thể vào thẳng operation hiện tại nếu bật <code>AllowActualWipWithoutPreviousBatch</code>.
      Công đoạn tương lai chỉ đi theo Previous Main Plan Op/Previous Batch khi rule cho phép.
      Không tự tạo lịch sử Batch giả cho các công đoạn đã đi qua trước khi hệ thống được sử dụng.
     </div>

     <AutoPlanningRuleManager
      initialRules={rulesQ.rows as any}
      fieldOptions={fields as any}
     />

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Giải thích tất cả cột Auto Planning Rule</b>
       <span>{COLUMN_NOTES.length} nhóm trường</span>
      </div>
      <div className="table-wrap">
       <table className="erp-table auto-rule-help-table">
        <thead>
         <tr><th>Column / Setting</th><th>Type</th><th>Điều kiện / ý nghĩa</th></tr>
        </thead>
        <tbody>
         {COLUMN_NOTES.map(([name,type,note])=>
          <tr key={name}>
           <td><code>{name}</code></td>
           <td>{type}</td>
           <td>{note}</td>
          </tr>
         )}
        </tbody>
       </table>
      </div>
     </div>

     <div className="erp-table-panel section">
      <div className="erp-panel-head">
       <b>Các cột có thể dùng làm Priority</b>
       <span>{fields.length} fields</span>
      </div>
      <div className="table-wrap">
       <table className="erp-table auto-rule-help-table">
        <thead><tr><th>Priority Field</th><th>Tên hiển thị</th><th>Nguồn dữ liệu</th></tr></thead>
        <tbody>
         {fields.map((f:any)=>
          <tr key={f.key}>
           <td><code>{f.key}</code></td>
           <td>{f.label}</td>
           <td>{f.source}</td>
          </tr>
         )}
        </tbody>
       </table>
      </div>
     </div>
    </section>
   </div>
  </main>
 }finally{
  c.release();
 }
}
