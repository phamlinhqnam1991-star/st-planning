import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

// =====================================================================
// LOGIC & HƯỚNG DẪN v393
// Tài liệu vận hành nằm ngay trong app. Nội dung mô tả SOURCE OF TRUTH,
// trình tự thao tác, dependency và impact của từng tab theo code hiện tại.
// Phần "Mapping đang chạy" đọc trực tiếp database để đối chiếu cấu hình thật.
// =====================================================================

const badge=(text:string,kind="blue")=>
 <span className={`guide-badge guide-badge-${kind}`}>{text}</span>;

function Rule({title,children,tone="normal"}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){
 return <div className={`guide-rule guide-rule-${tone}`}>
  <b>{title}</b>
  <div>{children}</div>
 </div>;
}

function Chain({steps}:{steps:{t:string;d?:string;c?:string}[]}){
 return <div className="lg-chain">
  {steps.map((s,i)=><span className="lg-chain-item" key={`${s.t}-${i}`}>
   <span className={`lg-chain-box lg-chain-${s.c||"blue"}`}>{s.t}{s.d&&<small>{s.d}</small>}</span>
   {i<steps.length-1&&<span className="lg-chain-arrow" aria-hidden="true">→</span>}
  </span>)}
 </div>;
}

function Section({id,title,children,sub}:{id:string;title:string;children:React.ReactNode;sub?:string}){
 return <section id={id} className="erp-table-panel guide-section">
  <div className="erp-panel-head"><div><b>{title}</b>{sub&&<small className="planning-sub">{sub}</small>}</div></div>
  <div className="lg-body">{children}</div>
 </section>;
}

function Faq({q,a}:{q:string;a:React.ReactNode}){
 return <details className="lg-faq"><summary>{q}</summary><div>{a}</div></details>;
}

function StepList({items}:{items:React.ReactNode[]}){
 return <ol className="lg-steps">{items.map((x,i)=><li key={i}>{x}</li>)}</ol>;
}

export default async function Page(){
 const db=await getPool().connect();
 let mappings:any[]=[],areas:any[]=[],scheduleAreas:any[]=[],mainOps:any[]=[],nextOps:any[]=[];
 let recipes:any[]=[],recipeMaps:any[]=[],timeRules:any[]=[],handlingRules:any[]=[],resources:any[]=[];
 let mainLinks:any[]=[],groupLinks:any[]=[];
 const liveErrors:Record<string,string>={};
 const readLive=async(key:string,sql:string)=>{
  try{
   const result=await db.query(sql);
   return result.rows;
  }catch(e){
   liveErrors[key]=e instanceof Error?e.message:String(e);
   return [];
  }
 };
 try{
  [mappings,areas,scheduleAreas,mainOps,nextOps,recipes,recipeMaps,timeRules,handlingRules,resources,mainLinks,groupLinks]=await Promise.all([
   readLive("mappings",`
    select m.sort_order,m.source_operation_code,m.st_group,m.standard_operation_rule,m.mapping_rule
    from md_st_operation_mapping m
    join md_st_operation_scope scope
      on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
     and scope.is_active=true and scope.operation_type='PLANNING_OPERATION'
    where m.is_active=true
    order by m.st_group,m.sort_order,m.source_operation_code`),
   readLive("areas",`
    select a.id,a.area_code,a.area_name,a.sort_order,
     coalesce(string_agg(g.st_group,', ' order by g.st_group) filter(where g.st_group is not null),'—') st_groups
    from md_area a
    left join md_area_operation_group g on g.area_id=a.id and g.is_active=true
    where a.is_active=true
    group by a.id
    order by a.sort_order,a.area_code`),
   readLive("scheduleAreas",`
    select s.schedule_area_code,s.schedule_area_name,s.resource_group,s.resource_code,s.default_rows,
           coalesce(pwa.planner_owner,s.planner_owner,'UNASSIGNED') planner_owner,s.display_order,
           coalesce(string_agg(distinct m.standard_operation,', ' order by m.standard_operation)
             filter(where m.standard_operation is not null),'—') operations
    from md_schedule_area s
    left join md_planner_work_assignment pwa
      on pwa.schedule_area_code=s.schedule_area_code
     and pwa.is_active=true
    left join md_schedule_area_operation m
      on m.schedule_area_code=s.schedule_area_code
     and m.is_active=true
    where s.is_active=true
    group by s.schedule_area_code,s.schedule_area_name,s.resource_group,s.resource_code,
             s.default_rows,s.planner_owner,pwa.planner_owner,s.display_order
    order by s.display_order,s.schedule_area_code`),
   readLive("mainOps",`
    select standard_operation,st_group,batch_prefix,planning_sort_order,is_active
    from md_operation_master
    order by is_active desc,planning_sort_order nulls last,standard_operation`),
   readLive("nextOps",`
    with bridge_ops as (
     select distinct upper(trim(bo.operation_code)) operation_code
     from md_intermediate_bridge_operation bo
     join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
    ), manual_scope as (
     select upper(trim(operation_code)) operation_code,
      case when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
     from md_st_operation_scope
     where is_active=true and operation_type<>'INTERMEDIATE'
     group by upper(trim(operation_code))
    ), catalog as (
     select operation_code,operation_type from manual_scope
     union
     select b.operation_code,'BRIDGE_INTERMEDIATE'::text
     from bridge_ops b
     where not exists(select 1 from manual_scope s where s.operation_code=b.operation_code)
    )
    select cat.operation_code,cat.operation_type,o.operation_name,o.planning_sort_order
    from catalog cat
    left join lateral (
     select x.operation_name,x.planning_sort_order
     from md_operation x
     where x.is_active=true and upper(trim(x.operation_code))=cat.operation_code
     order by case when trim(x.operation_code)=cat.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
     limit 1
    ) o on true
    order by o.planning_sort_order nulls last,cat.operation_code`),
   readLive("recipes",`
    select r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,
     (select coalesce(nullif(m.operation_code,''),m.standard_operation)
      from md_main_operation_recipe m
      where m.recipe_key=r.recipe_key and m.is_active=true
      order by (m.is_default=false),m.priority,m.operation_code limit 1) default_operation
    from md_process_recipe r
    where r.is_active=true
    order by r.process_family,r.recipe_no,r.recipe_name`),
   readLive("recipeMaps",`
    select m.mapping_id,m.operation_code,m.standard_operation,m.recipe_key,m.priority,m.is_default,m.selection_rule
    from md_main_operation_recipe m
    where m.is_active=true
    order by m.operation_code,m.priority,m.recipe_key`),
   readLive("timeRules",`
    select r.recipe_key,r.calc_type,r.priority,r.fixed_hours,r.standard_hours,r.qty_min,r.qty_max,
           r.surface_min_dm2,r.surface_max_dm2
    from md_recipe_time_rule r
    where r.is_active=true
    order by r.recipe_key,r.priority,r.id`),
   readLive("handlingRules",`
    select r.phase,r.priority,r.qty_min,r.qty_max,r.surface_min_dm2,r.surface_max_dm2,r.duration_minutes
    from md_chemical_handling_time_rule r
    where r.is_active=true
    order by r.phase,r.priority,r.id`),
   readLive("resources",`
    select r.resource_code,r.resource_name,r.resource_group,r.sort_order,r.max_concurrent
    from md_schedule_resource r
    where r.is_active=true
    order by r.sort_order,r.resource_code`),
   readLive("mainLinks",`
    select o.standard_operation,o.st_group,o.batch_prefix,o.planning_sort_order,
           count(distinct m.source_operation_code) source_count,
           count(distinct mr.mapping_id) recipe_count,
           coalesce(string_agg(distinct sa.schedule_area_code, ', ' order by sa.schedule_area_code) filter(where sa.schedule_area_code is not null),'—') schedule_areas,
           coalesce(string_agg(distinct coalesce(pwa.planner_owner,sa.planner_owner), ', ' order by coalesce(pwa.planner_owner,sa.planner_owner)) filter(where coalesce(pwa.planner_owner,sa.planner_owner) is not null and btrim(coalesce(pwa.planner_owner,sa.planner_owner))<>''),'—') planners
    from md_operation_master o
    left join md_st_operation_mapping m
      on m.is_active=true
     and upper(trim(m.standard_operation_rule))=upper(trim(o.standard_operation))
    left join md_main_operation_recipe mr
      on mr.is_active=true
     and upper(trim(coalesce(mr.standard_operation,'')))=upper(trim(o.standard_operation))
    left join md_schedule_area_operation sao
      on sao.is_active=true
     and upper(trim(sao.standard_operation))=upper(trim(o.standard_operation))
    left join md_schedule_area sa
      on sa.is_active=true
     and sa.schedule_area_code=sao.schedule_area_code
    left join md_planner_work_assignment pwa
      on pwa.is_active=true
     and pwa.schedule_area_code=sa.schedule_area_code
    where o.is_active=true
    group by o.standard_operation,o.st_group,o.batch_prefix,o.planning_sort_order
    order by o.planning_sort_order nulls last,o.standard_operation`),
   readLive("groupLinks",`
    select g.st_group,g.group_name,
           coalesce(string_agg(distinct a.area_name, ', ' order by a.area_name) filter(where a.area_name is not null),'—') areas,
           coalesce(string_agg(distinct s.schedule_area_name, ', ' order by s.schedule_area_name) filter(where s.schedule_area_name is not null),'—') schedule_areas,
           coalesce(string_agg(distinct coalesce(pwa.planner_owner,s.planner_owner), ', ' order by coalesce(pwa.planner_owner,s.planner_owner)) filter(where coalesce(pwa.planner_owner,s.planner_owner) is not null and btrim(coalesce(pwa.planner_owner,s.planner_owner))<>''),'—') planners,
           coalesce(string_agg(distinct om.standard_operation, ', ' order by om.standard_operation) filter(where om.standard_operation is not null),'—') main_operations
    from md_st_group g
    left join md_area_operation_group ag on ag.is_active=true and ag.st_group=g.st_group
    left join md_area a on a.is_active=true and a.id=ag.area_id
    left join md_operation_master om on om.is_active=true and om.st_group=g.st_group
    left join md_schedule_area_operation sao on sao.is_active=true and upper(trim(sao.standard_operation))=upper(trim(om.standard_operation))
    left join md_schedule_area s on s.is_active=true and s.schedule_area_code=sao.schedule_area_code
    left join md_planner_work_assignment pwa on pwa.is_active=true and pwa.schedule_area_code=s.schedule_area_code
    where g.is_active=true
    group by g.st_group,g.group_name
    order by g.st_group`)
  ]);
 }catch(e){
  liveErrors.page=e instanceof Error?e.message:String(e);
 }finally{
  db.release();
 }

 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="LOGIC & GUIDE"/>
  <AppTabs active="guide"/>

  <section className="erp-content erp-content-full guide-page">
   <div className="erp-page-head guide-head">
    <div>
     <h2>Logic & Hướng dẫn vận hành</h2>
     <p>Flow · Mapping · Cách thao tác · Ảnh hưởng phía sau theo logic hiện tại.</p>
    </div>
   </div>

   <div className="guide-jump">
    <a href="#quick">Bắt đầu nhanh</a>
    <a href="#flow">Flow tổng</a>
    <a href="#master">Master Data</a>
    <a href="#config">Cấu hình</a>
    <a href="#tracker">Part Tracker</a>
    <a href="#jobtracker">Job Tracker</a>
    <a href="#openjobs">All Open Jobs</a>
    <a href="#planning">Planning Board</a>
    <a href="#masking">Masking / Unmasking trong Báo cáo sản xuất</a>
    <a href="#schedule">Board Điều Độ</a>
    <a href="#import">Import Master</a>
    <a href="#production">Production Execution</a>
    <a href="#dashboard">Dashboard & AI</a>
    <a href="#impact">Impact Matrix</a>
    <a href="#live">Mapping đang chạy</a>
    <a href="#faq">FAQ</a>
   </div>

   <Section id="quick" title="1 · Bắt đầu nhanh — thứ tự vận hành chuẩn"
    sub="Nếu hệ thống đã cấu hình xong, người dùng hằng ngày chủ yếu đi từ All Open Jobs → Planning Board → Board Điều Độ">
    <Chain steps={[
     {t:"A · Import Master",d:"Part / Routing / Finish / Requirement",c:"gray"},
     {t:"B · Cấu hình",d:"Operation → Recipe → Time → Area",c:"teal"},
     {t:"C · Import All Open Job",d:"Snapshot NEW/CHANGED/CLOSED",c:"blue"},
     {t:"D · Planning Board",d:"READY → chọn Job → Batch",c:"blue"},
     {t:"E · Board Điều Độ",d:"Unscheduled Batch → Resource/Time",c:"green"},
     {t:"F · Báo cáo sản xuất",d:"Production + Unmasking → Masking theo Job",c:"teal"},
     {t:"G · Handoff",d:"Batch mở Main kế tiếp",c:"orange"},
     {t:"H · Dashboard",d:"KPI → Risk → AI Analysis",c:"green"},
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Nguyên tắc 1 · Master ≠ Config" tone="important">
      <b>Master Data</b> là dữ liệu kỹ thuật từ file nguồn; <b>Cấu hình</b> là quyết định planning của nhà máy. Không sửa Master để chữa một lỗi Mapping nếu lỗi nằm ở Configuration.
     </Rule>
     <Rule title="Nguyên tắc 2 · NextOperation kế thừa Main Planning Order" tone="important">
      Planning Board resolve <b>RAW NextOperation → ST Operation Mapping → Main Operation → Main Planning Order</b>. <b>Operation Code Order</b> ở Source Operation chỉ là tie-breaker tùy chọn trong cùng Main. READY/WAIT vẫn dùng Planning Chain như trước.
     </Rule>
     <Rule title="Nguyên tắc 3 · Recipe condition ≠ Process Time condition" tone="warning">
      Condition ở <b>Operation Code → Recipe</b> chọn Recipe và là nguồn checkbox <b>Batch Compatibility</b>. Condition ở <b>Process Time</b> chỉ chọn rule thời gian. Hai bộ condition độc lập.
     </Rule>
     <Rule title="Nguyên tắc 4 · Tạo Batch đã là handoff">
      Batch chưa điều độ (<b>PLANNED-UNSCHEDULED</b>) vẫn được xem là Main trước đã plan. Vì vậy Main kế tiếp có thể READY ngay; Scheduling không phải điều kiện bắt buộc để mở Main kế tiếp.
     </Rule>
    </div>
    {Object.keys(liveErrors).length>0&&<div className="notice"><b>Lưu ý:</b> Một số bảng Mapping sống không đọc được; các bảng còn lại vẫn hiển thị dữ liệu thật từ database. Chi tiết lỗi nằm ngay tại bảng tương ứng.</div>}
   </Section>

   <Section id="flow" title="2 · Flow dữ liệu & dependency tổng thể"
    sub="Dữ liệu đi từ kỹ thuật → định nghĩa planning → snapshot job → batch → schedule; thay đổi upstream sẽ lan xuống downstream">
    <div className="lg-subtitle">2.1 · Luồng dữ liệu chính</div>
    <Chain steps={[
     {t:"Master Excel",d:"Part · Revision · Routing · Finish · Requirement",c:"gray"},
     {t:"Master Tables",d:"md_part · md_routing_* · md_st_routing",c:"teal"},
     {t:"Configuration",d:"Scope · Mapping · Main · Recipe · Time · Area",c:"teal"},
     {t:"All Open Jobs",d:"open_job_current + source_data",c:"blue"},
     {t:"Planning Chain",d:"planning_job_operation",c:"blue"},
     {t:"Batch",d:"planning_batch + planning_batch_job",c:"orange"},
     {t:"Schedule",d:"planning_schedule",c:"green"},
    ]}/>

    <div className="lg-subtitle">2.2 · Một Job được đưa vào Planning như thế nào?</div>
    <StepList items={[
     <>Job phải đang <b>Open</b> và RAW <code>NextOperation</code> thuộc operational ST Scope <b>PLANNING_OPERATION</b> hoặc <b>ST_SCOPE_ONLY</b> thì mới xuất hiện ở All Open Jobs của ST. Nhãn <b>INTERMEDIATE</b> mới chỉ dành cho Dashboard và không làm Job xuất hiện ở đây.</>,
     <>Nếu Operation là <b>ST_SCOPE_ONLY</b>, Job vẫn thấy ở All Open Jobs nhưng Operation đó không trở thành Main Planning, không tạo Batch và không vào Board Điều Độ.</>,
     <>Planning resolver dùng Routing + Bridge + Source → Main Mapping để tạo các occurrence Main trong <code>planning_job_operation</code>.</>,
     <>Trạng thái tuần tự: Main chưa plan đầu tiên trong suffix hiện tại = <b>READY</b>; Main chưa plan phía sau = <b>WAIT</b>; Main có Batch = <b>PLANNED</b>; tiến độ vật lý đã qua = <b>DONE</b>.</>,
     <>Planner có thể đặt <b>Job/Main HOLD</b> trước khi vào Batch. HOLD được lưu trên đúng <code>planning_job_operation</code>, chặn Job đó khỏi Batch nhưng không Hold các Job khác; Release Hold sẽ tính lại đúng READY/WAIT cho riêng Job đó.</>,
     <>Khi tạo Batch cho READY, server cập nhật đúng Job đó và tính lại chain; chỉ Main kế tiếp được mở READY. Client dùng <b>Delta Refresh</b>, không reload toàn Planning Board.</>
    ]}/>

    <div className="lg-subtitle">2.3 · Source of truth cần nhớ</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Nội dung</th><th>Nguồn chuẩn</th><th>Không nên dùng thay thế</th></tr></thead>
     <tbody>
      <tr><td>RAW NextOperation</td><td><code>open_job_current.next_operation</code></td><td>Current Main cũ (đã bỏ khỏi Board)</td></tr>
      <tr><td>Operation Code Order (tie-break)</td><td><code>md_operation.planning_sort_order</code></td><td>Main Planning Order (primary)</td></tr>
      <tr><td>Main Planning sequence / NextOperation presentation</td><td><code>md_operation_master.planning_sort_order</code> + canonical mapping/chain</td><td>Operation Code Order chỉ tie-break trong cùng Main</td></tr>
      <tr><td>Source → Main</td><td><code>md_st_operation_mapping</code></td><td>Recipe mapping</td></tr>
      <tr><td>Recipe runtime</td><td><code>md_main_operation_recipe</code> + <code>selection_rule</code></td><td>Không dùng mapping khác thay thế</td></tr>
      <tr><td>Batch Compatibility</td><td>Recipe mapping <code>selection_rule</code> + selection lưu trên Batch</td><td>Process Time condition</td></tr>
      <tr><td>Job/Main Hold</td><td><code>planning_job_operation.is_hold</code> + reason/note/user/time</td><td><code>planning_schedule.status=HOLD</code> (đó là Hold cấp Batch/Schedule)</td></tr>
      <tr><td>Process Time chuẩn</td><td><code>md_recipe_time_rule</code> + condition table</td><td>Duration planner override</td></tr>
      <tr><td>Planner ownership</td><td>Schedule Area → Planner Assignment</td><td>Danh sách Planner hard-code</td></tr>
     </tbody>
    </table></div>
   </Section>

   <Section id="master" title="3 · Tab Master Data — dữ liệu kỹ thuật nền"
    sub="Phần lớn là read-only sau Import Master; dùng để kiểm tra Part/Revision/Routing và làm nguồn cho resolver">
    <div className="lg-note"><b>Khi nào vào tab này?</b> Khi muốn xác nhận dữ liệu kỹ thuật đã import đúng chưa, Routing của Part/Revision là gì, Finish/Primer/Topcoat/Requirement nào đang gắn với Part, hoặc vì sao Planning resolver nhìn thấy một operation.</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Màn hình</th><th>Chức năng</th><th>Được dùng ở đâu phía sau</th><th>Nếu dữ liệu sai/thay đổi</th></tr></thead>
     <tbody>
      <tr><td><b>Part</b></td><td>Danh mục Part, mô tả, Program, cluster, Surface dm².</td><td>Part Tracker, Recipe/condition lookup, Surface tính Batch.</td><td>Ảnh hưởng lookup Part và các phép tính dựa Surface.</td></tr>
      <tr><td><b>Part Revision</b></td><td>Revision thuộc Part, active/inactive.</td><td>Join Finish, Requirement, Routing, Recipe fallback.</td><td>Revision không còn active sẽ không nên dùng cho routing mới.</td></tr>
      <tr><td><b>Source Operation</b></td><td>Danh mục Operation Code gốc từ Master; có <b>Operation Code Order</b> tùy chọn.</td><td>ST Scope, Bridge, tie-break Planning Board.</td><td>Đổi Operation Code Order chỉ đổi tie-break trong cùng Main, không đổi READY/WAIT.</td></tr>
      <tr><td><b>Routing Detail</b></td><td>Chuỗi operation đầy đủ theo Part + Revision, có seq và Next Operation.</td><td>Dựng ST Routing standardized, Bridge Intermediate, Part Tracker.</td><td>Routing thay đổi sẽ làm thay đổi physical sequence và có thể cần rebuild derived routing/bridge.</td></tr>
      <tr><td><b>Material Finish</b></td><td>Primer1/2/3, Topcoat1/2, Anti-abrasion, finish name...</td><td>Paint Recipe resolver/condition, Part Tracker.</td><td>Có thể làm Job resolve sang Recipe sơn khác.</td></tr>
      <tr><td><b>Process Requirement</b></td><td>Chỉ lưu Requirement code/value được active MD:REQ Recipe Rule dùng hoặc planner đánh dấu Manual Keep; value rỗng không lưu.</td><td>Recipe condition builder, Part Tracker/Job Tracker khi cần Requirement.</td><td>Thêm/bỏ MD:REQ hoặc Keep chỉ cần Rebuild riêng Requirement; không cần Import Master đầy đủ nếu Routing/Material/Recipe không đổi.</td></tr>
      <tr><td><b>ST Routing Master</b></td><td>Routing ST chuẩn hóa theo signature.</td><td>Canonical route, Part → Routing.</td><td>Ảnh hưởng route nào được Part dùng.</td></tr>
      <tr><td><b>ST Routing Chain</b></td><td>Chuỗi ST theo routing_code + seq + raw operation + standard operation.</td><td>Auto Intermediate Bridge, Planning Chain, Part Tracker.</td><td>Đây là nguồn quan trọng để suy ra operation trung gian giữa hai Main.</td></tr>
      <tr><td><b>Part → Routing</b></td><td>Map Part + Revision → routing_code.</td><td>Part Tracker và chain resolver.</td><td>Map sai sẽ làm Part chạy nhầm routing.</td></tr>
     </tbody>
    </table></div>
    <Rule title="Cách kiểm tra một Part" tone="important">
     Dùng <b>Part Tracker</b> thay vì mở từng bảng: tìm Part → chọn Revision → kiểm tra Finish/Requirement → Routing Detail → ST Routing/Planning Chain. Nếu sai, quay về Master/Configuration tương ứng để sửa nguồn.
    </Rule>
   </Section>

   <Section id="config" title="4 · Tab Cấu hình — trình tự và ảnh hưởng downstream"
    sub="Tầng 1 định nghĩa công đoạn/ownership; Tầng 2 định nghĩa Recipe và thời gian. Nên cấu hình theo đúng thứ tự bên trái">

    <div className="lg-subtitle">4.1 · Tầng 1 — Định nghĩa công đoạn</div>
    <details open className="erp-details">
     <summary><b>① ST Operation Flow — Trợ lý Operation</b></summary>
     <div className="lg-key lg-key-2">
      <Rule title="Mục đích">Quản lý 2 lớp trên cùng màn hình: operational ST Scope gồm <b>PLANNING_OPERATION / ST_SCOPE_ONLY</b>, và nhãn <b>INTERMEDIATE Dashboard ST</b>. Planning Operation mới cần Main/ST Group/Area/Schedule Area/Planner. INTERMEDIATE chỉ dùng để xác nhận một Bridge operation được tính trên Dashboard; Previous/Next Main vẫn lấy từ Bridge.</Rule>
      <Rule title="Bridge Intermediate">Auto/Manual Bridge và Dashboard ST membership là hai lớp độc lập. Bridge đọc <code>routing_code + seq + operation_code</code> để suy ra toàn bộ raw operation nằm giữa hai Main; trong danh sách Operation sẽ thấy cả <b>Bridge Intermediate</b> và <b>Intermediate · ST Dashboard</b> đã được đánh dấu <code>INTERMEDIATE</code>. Nhãn này không tham gia operational Planning Scope.</Rule>
     </div>
     <StepList items={[
      <>Chọn Operation Code.</>,
      <>Nếu là Planning Operation: chọn <b>Main Operation → ST Group → Physical Area → Schedule Area → Planner</b>.</>,
      <>Nếu Operation là Bridge Intermediate và thực sự cần tính vào Dashboard Surface Treatment: chọn <b>INTERMEDIATE</b> / bấm <b>Đánh dấu Dashboard ST</b>. Nhãn này chỉ ảnh hưởng population của toàn bộ Dashboard (cards/tables/charts); không tạo/sửa Main, All Open Jobs, Planning Chain, Candidate, Batch hoặc Schedule.</>,
      <>Nếu chỉ cần hiện trong phạm vi ST nhưng không plan và không phải Bridge Intermediate: chọn <b>ST_SCOPE_ONLY</b>.</>,
      <>Lưu. Khi thay đổi cấu trúc routing/bridge, dùng chức năng rebuild phù hợp; sau thay đổi chain lớn nên Rebuild Planning Chain ở Planning Board.</>
     ]}/>
     <div className="notice"><b>Impact:</b> PLANNING_OPERATION và ST_SCOPE_ONLY vẫn là cấu hình operational upstream. Riêng <b>INTERMEDIATE Dashboard ST</b> chỉ ảnh hưởng population của toàn bộ Dashboard và không kích hoạt Planning Chain sync. Mapping sai Area/Planner của Planning Operation vẫn ảnh hưởng Board Điều Độ.</div>
    </details>

    <details className="erp-details">
     <summary><b>② ST Scope · Operation Code Order</b></summary>
     <p><b>ST Scope</b> quyết định Operation Code nào thuộc phạm vi ST. RAW NextOperation lấy Main qua mapping/chain và kế thừa <b>Main Planning Order</b>. Operation Code Order chỉ là tie-breaker tùy chọn trong cùng Main.</p>
     <div className="lg-key lg-key-2">
      <Rule title="Ví dụ">CMSA=10 · FMSKG-CM=20 · INSPLM=25 · SCRB-CM=27 · CHEMMILL=30 → khi Sort Priority chọn NextOperation ASC, Board đi theo đúng số này.</Rule>
      <Rule title="Không ảnh hưởng READY/WAIT" tone="important">Operation Code Order lưu ở <code>md_operation.planning_sort_order</code>. Nó <b>không</b> thay Main sequence, Previous Main, Recipe, Batch hay Schedule.</Rule>
     </div>
     <p>Main chưa có Main Planning Order được đưa xuống cuối. Trong cùng Main, Operation Code có Order được dùng làm tie-breaker; nếu chưa đặt thì sort ổn định theo RAW NextOperation. Sort Priority vẫn là nguồn thứ tự trình bày của planner.</p>
    </details>

    <details className="erp-details">
     <summary><b>③ Source → Main Mapping</b></summary>
     <p>Map raw Operation Code thành Main Operation chuẩn. Chỉ <b>Planning Operation</b> xuất hiện ở đây; ST_SCOPE_ONLY không được map vào Main.</p>
     <StepList items={[
      <>Chọn Source Operation đã nằm trong ST Scope loại Planning.</>,
      <>Chọn ST Group/Main phù hợp và mapping rule (DIRECT/OCCURRENCE/SEQUENCE/... theo nhu cầu route).</>,
      <>Kiểm tra kết quả standardized trong ST Routing/Planning Chain.</>
     ]}/>
     <div className="notice"><b>Impact:</b> Mapping sai = Job vào sai Main trên Route Matrix, Recipe lookup theo source/main có thể sai, Schedule Area phía sau có thể không phù hợp.</div>
    </details>

    <details className="erp-details">
     <summary><b>④ Công đoạn chính (Main Operation)</b></summary>
     <p>Danh mục Main Planning. Có thể <b>Thêm / Đổi tên / Batch Prefix / Planning Order / Ngưng / Kích hoạt / Xóa an toàn</b>.</p>
     <ul className="lg-list">
      <li><b>Batch Config</b>: Prefix tùy biến (vd <code>XXX_</code>) + Sequence Start + số chữ số (Padding) + Common Batch Size + Recipe Batch Size + Auto Split. Batch No = Prefix + sequence; không tự chèn ngày. Ví dụ Start=1, Padding=5 → <code>XXX_00001</code>.</li><li><b>Batch Size theo Recipe</b>: hệ thống ưu tiên Batch Size cấu hình cho đúng Main Operation + Recipe. Nếu Recipe đó không có override thì dùng Common Batch Size. Nếu cả Recipe Batch Size và Common Batch Size đều trống thì không split, toàn bộ Qty được dùng chung trong một Batch. Auto Split OFF luôn không chia.</li><li><b>Auto Split theo Qty</b>: nếu Batch Size hiệu lực=12, một Job 24 pcs được chia tự động thành 2 lô 12 pcs; cùng Job Operation có thể có allocation ở nhiều Batch nhưng tổng allocation vẫn là nguồn xác định PLANNED.</li><li><b>Hiển thị trên Planning Board</b>: nếu cùng một Job/Main Operation được chia vào nhiều Batch, ô Main Operation vẫn chỉ là một ô và gộp các Batch No bằng dấu <code>&amp;</code>, ví dụ <code>ASP_0001 &amp; ASP_0002</code>. Đây chỉ là hiển thị; từng Batch vẫn là allocation độc lập cho Scheduling/Execution.</li>
      <li><b>Planning Order</b>: thứ tự Main nội bộ cho canonical Planning Chain và READY/WAIT. Không hiển thị trên Planning Board.</li>
      <li><b>Ngưng</b>: không dùng cho Planning mới nhưng giữ lịch sử.</li>
      <li><b>Xóa</b>: chỉ khi đã ngưng và không còn Mapping/Recipe/Planning/Batch/Bridge/Handover dependency.</li>
      <li><b>Đổi tên</b>: API cập nhật các liên kết liên quan; vẫn nên kiểm tra lại Recipe, Area và Board sau rename.</li>
     </ul>
     <div className="notice"><b>Quan trọng:</b> RAW NextOperation phải kế thừa Main Planning Order qua Mapping. Bước ② Operation Code Order chỉ dùng tie-break trong cùng Main.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑤ ST Group</b></summary>
     <p>Gom các Main/Source Operation cùng nhóm công nghệ. ST Group là cầu nối từ Mapping xuống Physical Area.</p>
     <div className="notice"><b>Impact:</b> đổi/ngưng Group có thể làm Main mất liên kết Area; hệ thống chặn deactivate khi Group còn dependency quan trọng.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑥ Khu vực vật lý (Physical Area)</b></summary>
     <p>Gắn ST Group vào khu vực nhà máy. Một ST Group thuộc một khu vật lý active tại một thời điểm.</p>
     <div className="notice"><b>Impact:</b> dùng để tổ chức công việc và làm cầu nối tới Schedule Area. Thay Area không đổi Recipe nhưng có thể đổi nơi/nhóm điều độ.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑦ Khu vực điều độ (Schedule Area / Lane)</b></summary>
     <p>Định nghĩa lane trên Board Điều Độ: tên, thứ tự, resource group/resource, số dòng mặc định, các Main Operation được phép vào lane và trạng thái Điều độ tay.</p>
     <div className="notice"><b>Impact:</b> Main chưa gán Schedule Area sẽ không có lane phù hợp để điều độ. Gán sai Operation → kéo Batch vào lane có thể bị chặn.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑧ Phân chia Planner</b></summary>
     <p>Gán Schedule Area cho Planner 1/2. Board Điều Độ lấy ownership động từ mapping này.</p>
     <div className="notice"><b>Impact:</b> chuyển Planner chỉ đổi người nhìn/chịu trách nhiệm scheduling và handover alert; không đổi Routing, Recipe hay membership của Batch.</div>
    </details>

    <div className="lg-subtitle">4.2 · Tầng 2 — Công thức & Rule</div>
    <details open className="erp-details">
     <summary><b>⑨ Công thức & Rule — Recipe · Công đoạn · Mã lô</b></summary>
     <p>Đây là <b>nguồn Recipe runtime</b> của Planning Board. Mỗi <b>Recipe Rule</b> có <code>mapping_id</code> riêng và gắn <b>Operation Code → Recipe</b>, Priority, Default, điều kiện áp dụng cho Job, Batch Key template và Batch No Prefix. Cùng Operation Code + cùng Recipe có thể có nhiều rule condition khác nhau.</p>
     <div className="lg-key lg-key-2">
      <Rule title="Recipe resolver">Nếu một Operation có nhiều Recipe: rule có điều kiện khớp Job được xét; sau đó Priority nhỏ hơn → Default → thứ tự ổn định. Rule không condition là fallback.</Rule>
      <Rule title="Batch Compatibility" tone="important">Các condition trong <code>selection_rule</code> của Recipe mapping là nguồn checkbox “Điều kiện Recipe dùng để gom lô”. Planner có thể bỏ tích một số condition để mở rộng Job cùng Recipe; lựa chọn được lưu trên Batch.</Rule>
      <Rule title="Không còn Paint Selection Lock cũ" tone="important">Planning Board không còn khóa riêng theo <code>Part Master PRIMER1/2/3/TOPCOAT...</code>. READY Job được chọn theo <b>effective Recipe + Recipe Rule + các condition Batch Compatibility đang tích</b>. Vì vậy Job không bị khóa chỉ vì field Part Master paint trống nếu Recipe resolver đã xác định được Recipe hợp lệ.</Rule>
     </div>
     <StepList items={[
      <>Tạo/kiểm tra Recipe trong Danh mục Recipe. Có thể <b>chọn từ All Open Job</b> hoặc chuyển từng field Recipe Group / Recipe No / Recipe Name sang <b>Nhập tay</b>; field nhập tay không lưu source column.</>,
      <>Gán Recipe cho đúng <b>Operation Code</b> runtime.</>,
      <>Nếu cần, thêm condition “Áp dụng cho Job” (equals/contains/not empty/is empty/starts/ends theo UI).</>,
      <>Đặt Priority/Default, Batch Key template và Prefix nếu dùng.</>,
      <>Mở Planning Board và kiểm tra Recipe đề xuất của một READY Job trước khi tạo Batch.</>
     ]}/>
     <div className="notice"><b>Impact:</b> đổi mapping/condition có thể đổi Recipe đề xuất ngay trên Planning Board và đổi các checkbox Batch Compatibility. Existing Batch giữ Recipe đã lưu; server vẫn revalidate khi Add Job.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑩ Process Requirement Import Filter</b></summary>
     <p>Giảm dung lượng <code>md_process_requirement</code> theo 2 tầng: <b>Part/Revision Gate → Active MD:REQ Recipe Rule + Manual Keep</b>. Gate mặc định V376 tiếp tục là <b>ST = NO</b>.</p>
     <div className="lg-key lg-key-2">
      <Rule title="Part-level Gate" tone="important">Nếu một Gate active khớp, ví dụ <code>ST = NO</code>, Part/Revision đó lưu <b>0 Process Requirement row</b>; toàn bộ 38 Requirement đều bị bỏ, kể cả dòng ST. Gate có thể cấu hình thêm Requirement/blocked value khác.</Rule>
      <Rule title="Không hard-code code đang dùng">Nếu Part vượt Gate, Recipe Rule active tự động quyết định Requirement bắt buộc. Manual Keep chỉ dùng khi planner muốn giữ thêm Requirement để tra cứu dù chưa có rule; value rỗng vẫn bỏ.</Rule>
      <Rule title="Rebuild Requirement nhẹ" tone="important">V376 có luồng riêng chỉ đọc PartNum, RevisionNum, Gate đang active và Requirement sẽ import. Nó không hash/rebuild Part, Material Finish, Routing, Recipe, Auto Bridge hay Planning Chain.</Rule>
     </div>
     <div className="notice"><b>Luồng khuyến nghị V376:</b> chạy migration 069 + 070, kiểm tra Gate/Manual Keep, chọn file Master rồi dùng <b>Rebuild Requirement only</b>. Route này tự kiểm tra file, TRUNCATE riêng <code>md_process_requirement</code>, stream + insert theo chunk nhỏ và ANALYZE; không chạy các rebuild phía sau.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑪ Cột All Open Job (từ điển)</b></summary>
     <p>Scan các key/value unique trong All Open Job để condition builder chọn cột và giá trị chính xác, tránh gõ tay.</p>
     <StepList items={[
      <>Sau khi import All Open Job có cấu trúc/giá trị mới, bấm <b>Scan / Rebuild</b>.</>,
      <>Dùng danh sách này khi tạo Process Time condition và các rule cần cột Open Job.</>,
      <>Inactive value không hiện trong dropdown condition.</>
     ]}/>
     <div className="notice"><b>Impact:</b> đây là từ điển hỗ trợ cấu hình; scan không tự đổi Job/Batch. Nhưng không scan sau khi nguồn có cột mới sẽ khiến dropdown rule chưa thấy giá trị mới.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑫ Thời gian Loading / Unloading</b></summary>
     <p>Dùng cho Chemical Line. Rule chọn theo Priority + khoảng Qty + Surface dm²; Min/Max trống = không giới hạn.</p>
     <div className="notice"><b>Impact:</b> ảnh hưởng Loading End/Unloading End, chiếm dụng Flybar và xung đột trạm Loading. Không thay Process Time chuẩn.</div>
    </details>

    <details className="erp-details">
     <summary><b>⑬ Thời gian xử lý (Process)</b></summary>
     <p>Source of truth cho <code>planning_batch.process_minutes</code>. Hai mode:</p>
     <ul className="lg-list">
      <li><b>FIXED_HOURS</b>: thời gian cố định HH:MM.</li>
      <li><b>QTY_SURFACE</b>: chọn theo Qty Min/Max + Surface Min/Max, thời gian HH:MM.</li>
      <li>Mỗi rule có thể có nhiều condition All Open Job; nhiều condition = AND.</li>
      <li>Rule match nhiều condition hơn được ưu tiên trước; sau đó Priority nhỏ hơn; sau đó ID nhỏ hơn.</li>
      <li>Rule có condition chỉ match nếu <b>tất cả Job trong Batch</b> thỏa condition; Batch trộn giá trị rơi về fallback không condition nếu có.</li>
     </ul>
     <div className="notice"><b>Impact:</b> Create/Add/Remove Job hoặc đổi Recipe sẽ tính lại Process Time. Batch chưa schedule có thể cập nhật duration chuẩn. Duration planner override trên Schedule là thời gian điều độ thực tế và không ghi ngược vào rule chuẩn.</div>
    </details>

   </Section>

   <Section id="tracker" title="5 · Tab Part Tracker — kiểm tra một Part từ đầu đến cuối"
    sub="Read-only diagnostic: gom nhiều bảng Master/Mapping vào một màn hình theo Part Number">
    <StepList items={[
     <>Nhập Part Number hoặc mô tả. Nếu chưa exact, chọn Part trong danh sách match.</>,
     <>Xem <b>Part Summary</b>: Program, Cluster, Surface, số Revision, routing_code và Areas.</>,
     <>Theo từng Revision, mở <b>Part / Material / Finish</b> để kiểm tra Primer/Topcoat/Anti-abrasion và finish name.</>,
     <>Mở <b>Process Requirements</b> nếu Recipe rule phụ thuộc requirement.</>,
     <>Mở <b>Routing Detail</b> để xem raw sequence và Next Operation.</>,
     <>Mở <b>ST Routing / Planning Chain</b> để đối chiếu raw Operation → Standard Operation → ST Group → Area → Mapping Rule.</>
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Nếu Part Tracker sai Finish/Requirement">Sửa dữ liệu nguồn/Import Master; không sửa Recipe mapping để “che” lỗi Master nếu Master thực tế sai.</Rule>
     <Rule title="Nếu ST Routing/Standard Operation sai">Kiểm tra ST Scope → Source→Main Mapping → Bridge/Planning Chain. Sau thay đổi lớn, rebuild derived chain.</Rule>
    </div>
   </Section>

   <Section id="jobtracker" title="5B · Tab Job Tracker — tra toàn bộ vòng đời một Job"
    sub="Read-only diagnostic realtime: All Open Job → Routing → Planning → Recipe Rule → Batch → Schedule → Handover">
    <StepList items={[
     <>Nhập chính xác <b>Job Number</b>; cũng có thể tìm gần đúng theo Job / Part / Description rồi bấm Open.</>,
     <>Xem <b>Job Summary</b> để biết Last Operation, Next Operation, Main đang READY/SCHEDULED, Batch gần nhất, Resource và khoảng thời gian điều độ.</>,
     <>Xem <b>Planning Route / Job Lifecycle</b>: từng Source Operation → Main Planning → READY/WAIT/DONE/UNSCHEDULED/SCHEDULED, Recipe đang resolve và <b>Rule #mapping_id</b> đã match.</>,
     <>Xem <b>Batch & Schedule Detail</b>: Batch No, Recipe, condition compatibility, Process Time, Resource/Lane/Planner và timeline Loading → Process → NDT → Unloading nếu là Chemical Line.</>,
     <>Mở <b>All Open Job – Current Snapshot</b> để xem toàn bộ source_data thật của Job; đây là dữ liệu dùng bởi Recipe condition và Process Time condition.</>,
     <>Đối chiếu <b>Part / Revision Master</b>: Process Requirement, Routing Detail và ST Routing Master để biết chain được hình thành từ đâu.</>,
     <>Cuối trang xem <b>Open Job History</b> và <b>Planning Handover / Change Impact</b> để lần lại các thay đổi snapshot hoặc tác động Add/Remove Job giữa các Planner.</>
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Job Tracker không thay đổi dữ liệu">Tab này chỉ đọc/đối chiếu. Muốn sửa Recipe/Mapping/Time/Area phải quay về Cấu hình; muốn sửa Batch vào Planning Board; muốn sửa giờ/resource vào Board Điều Độ.</Rule>
     <Rule title="Nguồn trạng thái phải thống nhất">Route status dùng cùng logic Route Matrix của Planning Board; Recipe dùng live Recipe resolver; Schedule đọc trực tiếp planning_schedule. Vì vậy Job Tracker là màn chẩn đoán cross-module, không tạo một engine riêng.</Rule>
    </div>
   </Section>

   <Section id="openjobs" title="6 · Tab All Open Jobs — snapshot công việc thực tế"
    sub="Nguồn runtime của Job, LastOperation, NextOperation và toàn bộ source_data dùng bởi Planning/Recipe/Process condition">
    <div className="lg-subtitle">6.1 · Import All Open Job</div>
    <StepList items={[
     <>Chọn file XLSX và bấm <b>Import All Open Job</b>.</>,
     <>File được upload vào Storage; API so sánh snapshot theo <b>JobNum</b>.</>,
     <>Kết quả phân loại: <b>NEW / CHANGED / UNCHANGED / CLOSED</b>.</>,
     <>V377 chỉ sync <code>planning_job_operation</code> cho <b>NEW / CHANGED</b>; <b>UNCHANGED</b> bỏ qua rebuild, còn <b>CLOSED</b> chỉ deactivate live chain. Batch/Schedule history không bị xóa.</>,
     <>Nếu NEW/CHANGED Job đi tới RAW <code>NextOperation</code> chưa có ST Scope/Intermediate Bridge, Import sẽ báo <b>Operation mới / chưa cấu hình</b>. Hệ thống không tự đoán Main Operation; planner cấu hình một lần tại ST Operation Flow.</>,
     <>Current snapshot lưu ở <code>open_job_current</code>; lịch sử chỉ lưu snapshot NEW/CHANGED/CLOSED quan trọng ở Change History.</>,
     <>Sau import có cột/value mới, sang Cấu hình → Cột All Open Job → <b>Scan / Rebuild</b> nếu cần dùng chúng trong rule.</>
    ]}/>

    <div className="lg-subtitle">6.2 · Job nào xuất hiện?</div>
    <Rule title="ST Scope filter" tone="important">
     All Open Jobs của ứng dụng ST chỉ hiển thị Job có RAW <code>NextOperation</code> thuộc <b>PLANNING_OPERATION</b> hoặc <b>ST_SCOPE_ONLY</b>. <b>INTERMEDIATE Dashboard ST không phải visibility filter của All Open Jobs.</b> Source→Main Mapping cũng không phải visibility filter. ST_SCOPE_ONLY vẫn hiện nhưng không tham gia Planning Chain/Batch/Schedule.
    </Rule>

    <div className="lg-subtitle">6.3 · Các chế độ xem</div>
    <ul className="lg-list">
     <li><b>Status tabs:</b> Open / New / Changed / Unchanged / Closed / All.</li>
     <li><b>Search:</b> JobNum / Part / Last Operation / Next Operation / Program.</li>
     <li><b>Xem gọn:</b> các cột vận hành chính.</li>
     <li><b>Xem tất cả cột:</b> union key trong <code>source_data</code> của page hiện tại; dùng để xác nhận chính xác tên cột/value trước khi tạo rule.</li>
     <li><b>Change History:</b> xem lịch sử NEW/CHANGED/CLOSED.</li>
     <li><b>Mở:</b> xem chi tiết một Job.</li>
    </ul>

    <div className="lg-subtitle">6.4 · Các cột đặc biệt tác động downstream</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Cột</th><th>Dùng cho</th><th>Impact</th></tr></thead>
     <tbody>
      <tr><td><b>LastOperation / LastLaborOp</b></td><td>Định vị physical position trong route/bridge.</td><td>Sai có thể làm Current physical anchor/READY khác.</td></tr>
      <tr><td><b>NextOperation</b></td><td>ST Scope visibility, physical pair, Planning Board sort Next Op.</td><td>Đổi NextOperation có thể chuyển Job sang vị trí route khác.</td></tr>
      <tr><td><b>AllOperation</b></td><td>Fallback định vị route khi bridge/direct evidence không đủ.</td><td>Ảnh hưởng canonical fallback.</td></tr>
      <tr><td><b>Priority / Category</b></td><td>Highlight, filter, sort, recipe condition nếu được cấu hình.</td><td>Đổi giá trị có thể đổi thứ tự/recipe.</td></tr>
      <tr><td><b>source_data bất kỳ</b></td><td>Recipe condition, Batch Compatibility, Process Time condition, Planning filters/sort.</td><td>Đổi value có thể đổi Recipe, compatibility hoặc Process Time nếu rule tham chiếu cột đó.</td></tr>
     </tbody>
    </table></div>
   </Section>

   <Section id="planning" title="7 · Tab Planning Board — từ READY Job đến Production Batch"
    sub="Đây là màn hình trung tâm để planner chọn Job, khóa compatibility, tạo/thêm Batch và mở tuần tự Main kế tiếp">

    <div className="lg-subtitle">7.1 · Route Matrix và trạng thái READY / WAIT / PLANNED / DONE</div>
    <div className="lg-key lg-key-2">
     <Rule title="Sequential READY" tone="important">
      Trong suffix Main hiện tại: Main chưa có Batch đầu tiên = <b>READY</b>; mọi Main chưa plan phía sau = <b>WAIT</b>. Khi Main READY được đưa vào Batch, chỉ Main kế tiếp được mở READY.
     </Rule>
     <Rule title="Handoff hợp lệ">
      Previous Main ở trạng thái đã qua vật lý (<b>DONE</b>) hoặc đã có Batch không cancelled (<b>PLANNED-UNSCHEDULED / SCHEDULED</b>) được xem là handoff. Không cần chờ Schedule để mở Main kế tiếp.
     </Rule>
    </div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Trạng thái trên Matrix</th><th>Ý nghĩa</th><th>Có chọn vào Batch?</th></tr></thead>
     <tbody>
      <tr><td>{badge("READY","green")}</td><td>Main hiện tại được phép plan.</td><td><b>Có</b></td></tr>
      <tr><td>{badge("WAIT","warning")}</td><td>Previous Main liên tục chưa handoff.</td><td>Không</td></tr>
      <tr><td>{badge("PLANNED-UNSCHEDULED","blue")}</td><td>Đã có Batch nhưng chưa xếp lịch.</td><td>Không tạo lặp; đây đã là handoff.</td></tr>
      <tr><td>{badge("SCHEDULED","blue")}</td><td>Batch đã có schedule.</td><td>Không</td></tr>
      <tr><td>{badge("DONE","gray")}</td><td>Physical progress đã đi qua occurrence này.</td><td>Không</td></tr>
      <tr><td>NO CHAIN</td><td>Resolver không xác định được canonical Main hợp lệ.</td><td>Không; cần kiểm tra route/mapping/bridge.</td></tr>
     </tbody>
    </table></div>

    <div className="lg-subtitle">7.1.1 · Workload Summary — READY / WAIT / HOLD theo Main</div>
    <Rule title="Workload Summary phải mirror đúng Candidate / Route Matrix" tone="important">
     Workload Summary không được quét toàn bộ <code>planning_job_operation</code> trong database. Population Job phải giống chính Planning Board: <b>Open Job + live Current Main + RAW NextOperation nằm trong ST View đang resolve cho Board</b> (Planning Operation hoặc active Bridge Intermediate; <b>ST_SCOPE_ONLY</b> không vào Candidate). Chỉ sau khi có đúng tập Candidate Job này mới mở các active <code>planning_job_operation</code> của chính các Job đó để cộng <b>Area → Main Operation → READY / WAIT / HOLD</b>. Vì vậy click <b>CMSA · READY</b> lọc Route Matrix ra 10 Job thì tổng hai cột READY của CMSA cũng phải là 10 Job, không được cộng thêm các Job ngoài Candidate population.
    </Rule>
    <Rule title="READY tách theo trạng thái điều độ của Previous Main">
     Cùng một Main đang <code>ELIGIBLE / READY</code> được tách thành hai cột đọc-only: <b>READY · Previous Main Scheduled</b> khi immediate Previous Main đã có Schedule hợp lệ; và <b>READY · Previous Main Unscheduled / START</b> khi Previous Main chưa có Schedule hoặc đây là Main đầu tiên không có Previous Main. Hai cột cộng lại đúng bằng READY tổng và chỉ dùng để planner phân biệt mức độ sẵn sàng/handoff; không thay đổi Sequential READY rule.
    </Rule>
    <Rule title="Dashboard: một population Job chuẩn, workload vẫn giữ đầy đủ READY / WAIT" tone="important">
     Dashboard dùng một population Job chuẩn: <b>(1)</b> lấy <b>Current Main</b> từ live Planning Chain đã được resolver <b>LastOperation + RAW NextOperation</b> định vị; <b>(2)</b> trên kết quả đã resolve mới lọc RAW NextOperation theo Dashboard ST Scope; <code>PLANNING_OPERATION → MAIN</code>, <code>INTERMEDIATE → IMMEDIATE</code>, <code>ST_SCOPE_ONLY → ST ONLY</code>. Sau khi xác định Job thuộc Dashboard ST, các <b>Workload KPI / Surface Workload / Area-Main-Recipe</b> mở rộng <u>chỉ các Job này</u> theo toàn bộ active Planning Chain occurrence để giữ đúng trạng thái: <code>ELIGIBLE → READY</code>, <code>LOCKED → WAIT</code>, planned chưa điều độ → <code>PLANNED-UNSCHEDULED</code>, có schedule → <code>SCHEDULED</code>, Hold → <code>HOLD</code>. Vì vậy Main tương lai không bị mất WAIT. Riêng chart <b>Main / Immediate / ST Only</b> và CAT3/CAT5 vẫn dùng một dòng cho current open Job. <b>CAT3/CAT5 sắp trực tiếp theo NextOperation Order</b>: RAW Operation Code Order (<code>md_operation.planning_sort_order</code>) → Main Planning Order chỉ làm fallback khi RAW operation chưa có order → RAW NextOperation → Job. Nhãn INTERMEDIATE vẫn <b>chỉ dành cho Dashboard</b>; không thay đổi Planning Chain/Candidate/Batch/Schedule.
    </Rule>
    <ul className="lg-list">
     <li><b>Qty:</b> dùng CurrentGoodWIPQty nếu &gt; 0, nếu không dùng ProdQty — cùng quy tắc Candidate.</li>
     <li><b>Surface:</b> dùng TotalSurface; nếu thiếu thì Qty × SurfacePerPart.</li>
     <li><b>Repeated occurrence:</b> cùng Job + cùng Main + cùng status bucket chỉ tính một lần để không nhân đôi pcs/dm².</li>
     <li><b>Drill-down:</b> click một trong hai cột READY, WAIT hoặc HOLD để lọc Candidate Matrix theo đúng Main + route status; hai cột READY còn lọc thêm theo Previous Main Scheduled / Unscheduled. Nếu Route Matrix của Job chưa tải, Board hydrate trước rồi mới áp dụng filter.</li>
     <li><b>Refresh:</b> tự cập nhật sau Create/Add Batch, Hold/Unhold, Rebuild Planning Chain và khi đổi Area/Main scope; có nút Làm mới thủ công.</li>
    </ul>

    <div className="lg-subtitle">7.1.2 · NextOperation lặp lại nhiều occurrence</div>
    <Rule title="Earliest unfinished occurrence" tone="important">
     Một raw Operation Code có thể xuất hiện nhiều lần trong cùng Job, ví dụ <code>SIPT</code> lần đầu chuẩn hóa thành PRIMER1 và lần sau thành PRIMER2, hoặc <code>HE-BAKE</code> xuất hiện ở before blasting / after plating / HE-BAKE thường. Nếu <code>LastLaborOp → NextOperation</code> vẫn trùng ở nhiều occurrence, hoặc <code>LastLaborOp</code> đang blank/<code>START</code>, resolver không trả NO CHAIN chỉ vì NextOperation lặp. Hệ thống xét Batch history của từng occurrence theo đúng <code>operation_instance_key</code> và chọn <b>occurrence sớm nhất chưa có Batch</b>; nếu chưa có progress context thì chọn occurrence đầu tiên theo route. Ví dụ PRIMER1 chưa plan → PRIMER1 READY; PRIMER1 đã có Batch → SIPT kế tiếp/PRIMER2 trở thành Current Main. Với START → HE-BAKE, occurrence HE-BAKE đầu tiên chưa plan (ví dụ HE-BAKE before blasting) là Current Main. Nếu tất cả occurrence lặp lại đã plan, resolver giữ occurrence đầu để sequential gating replay chuỗi đã plan và mở Main chưa plan tiếp theo. Logic này áp dụng chung cho mọi raw Operation lặp, không hard-code SIPT hay HE-BAKE.
    </Rule>

    <div className="lg-subtitle">7.2 · Columns / Freeze / Excel Filter / Default View</div>
    <ul className="lg-list">
     <li><b>Columns:</b> chọn cột Planning và cột All Open Job, reorder, gom/thu gọn package All Open Job.</li>
     <li><b>Freeze Pane:</b> đóng băng các cột đầu để cuộn ngang Route Matrix.</li>
     <li><b>▼ Excel Filter:</b> mỗi header có distinct values + search + Select All/Clear; nhiều cột kết hợp AND.</li>
     <li><b>Main Planning (Route Matrix) filter:</b> lọc từng Main theo READY/PLANNED/SCHEDULED/DONE/WAIT...</li>
     <li><b>Default View:</b> lưu Columns + layout + filters + sort + density trên server theo view/operation, dùng lại ở môi trường khác.</li>
     <li><b>Current Main:</b> cột này đã bị loại khỏi Planning Board; không dùng để điều hành nữa.</li>
    </ul>

    <div className="lg-subtitle">7.3 · Sort Priority — đặc biệt Next Operation</div>
    <Rule title="Không còn hard-sort ẩn" tone="important">
     Planning Board chạy đúng thứ tự các rule trong <b>Sort Priority</b>. Nếu chọn <b>NextOperation</b>, comparator resolve RAW NextOperation → Main và dùng <code>md_operation_master.planning_sort_order</code>; <code>md_operation.planning_sort_order</code> chỉ tie-break trong cùng Main. NextOperation raw từ source_data trùng tên vẫn bị loại khỏi danh sách Sort để tránh chọn nhầm text sort.
    </Rule>
    <p>Ví dụ Sort Priority = ① NextOperation ASC → ② Priority DESC → ③ Job ASC. Board sẽ dùng Main Planning Order của Main chứa RAW NextOperation trước; Operation Code Order chỉ tie-break trong cùng Main, sau đó mới Priority rồi Job.</p>

    <div className="lg-subtitle">7.4 · Recipe sơn phải đúng occurrence PRIMER/TOPCOAT</div>
    <Rule title="Occurrence-aware Recipe Rule" tone="important">
     Một raw Operation Code như <code>SIPT</code> có thể phục vụ PRIMER1, PRIMER2 hoặc PRIMER3. Khi resolve <b>PRIMER1</b>, rule có condition paint-specific trỏ tới <code>PRIMER2</code>/<code>PRIMER3</code> bị loại trước bước Priority; PRIMER2 chỉ xét condition PRIMER2; PRIMER3 chỉ xét PRIMER3; TOPCOAT1/TOPCOAT2 tương tự. Condition chung như Program, Category, Group vẫn dùng cho mọi occurrence. Nhờ vậy Job có đồng thời PRIMER1=10P4 và PRIMER2=LR-200 không thể làm PRIMER1 chọn nhầm rule LR-200 của PRIMER2.
     Nếu Operation Code không có Recipe Rule phù hợp và phải fallback theo Part/Revision, fallback cũng bám đúng occurrence: <code>PRIMER→md_material_finish.primer1</code>, <code>PRIMER2→primer2</code>, <code>PRIMER3→primer3</code>, <code>TOPCOAT1→topcoat1</code>, <code>TOPCOAT2→topcoat2</code>. Không còn dùng PRIMER1 chung cho PRIMER2/PRIMER3.
    </Rule>

    <div className="lg-subtitle">7.5 · Chọn Area / chọn READY</div>
    <Rule title="Area Candidate dùng chung một bố cục nghiệp vụ" tone="important">
     Khi chọn một Area và để <b>Tất cả công đoạn</b>, mọi Area dùng cùng baseline Candidate: Job, PartDescription, CurrentGoodWIPQty, TotalSurface, LastLaborOp, NextOperation, Priority, OpenDMR (nếu cột nguồn tồn tại), sau đó là một cột ảo <b>Previous Main</b> + toàn bộ Main Operation thuộc Area theo Main Planning Order. Area preset cũ không được làm mất baseline này.
    </Rule>
    <StepList items={[
     <>Click/checkbox/drag một cell <b>READY</b>. Main Operation của occurrence đó trở thành Main đang build Batch.</>,
     <>Board thu gọn ma trận thành <b>Previous Main + Main đang chọn + Next Main Planning</b>. Previous Main hiện Main trước thực tế của Job + badge trạng thái (D/R/W/U/S/P/RN/H) + Batch + giờ điều độ. Main đang chọn chỉ giữ status/READY interaction; Recipe của Main đang chọn vẫn được dùng nội bộ cho Recipe Lock nhưng không hiển thị tại đây. Next Main Planning hiện Main kế tiếp và Recipe của chính Main kế tiếp nếu có.</>,
     <>Trong Main active, server resolve Recipe thật của từng Job. READY khác Recipe bị làm mờ/disable.</>,
     <>Nếu Recipe mapping có condition, panel <b>Batch Compatibility</b> hiện checkbox theo condition của <code>md_main_operation_recipe.selection_rule</code>.</>,
     <>Mặc định tích tất cả condition. Bỏ tích condition nào → condition đó không còn dùng để khóa membership. Bỏ hết → chỉ cần cùng Main + cùng Recipe.</>,
     <>Chỉ READY compatible mới giữ sáng và được phép thêm. Select All cũng chỉ chọn tập compatible.</>,
     <>Chế độ <b>Gọn</b> dùng row thấp hơn để thấy nhiều Job hơn. Nút <b>− / % / +</b> zoom riêng Ma trận kế hoạch từ 70% đến 130% và không zoom toàn trang.</>
    ]}/>

    <div className="lg-subtitle">7.6 · Batch Compatibility — chính xác lấy điều kiện từ đâu?</div>
    <div className="lg-key lg-key-2">
     <Rule title="Recipe luôn bắt buộc giống nhau" tone="important">Checkbox chỉ mở/bỏ bớt condition; không bao giờ cho phép trộn Recipe khác nhau trong cùng Batch.</Rule>
     <Rule title="Condition nguồn Recipe mapping">Checkbox lấy từ rule “Áp dụng cho Job” của đúng <b>recipe_mapping_id</b> mà Job đầu tiên đã match. Vì vậy cùng Operation Code + cùng Recipe vẫn có thể có nhiều bộ condition độc lập. Không lấy từ Process Time Rule.</Rule>
     <Rule title="Existing Batch">Khi chọn Target Batch có sẵn, Batch trở thành anchor; checkbox đã lưu được khôi phục. Không thể bật lại một condition nếu các member hiện tại đã không đồng nhất theo condition đó.</Rule>
     <Rule title="Server guard">UI chỉ là lớp UX. API Create/Add Batch re-resolve Recipe và revalidate selected condition để không thể bypass bằng request ngoài UI.</Rule>
    </div>

    <div className="lg-subtitle">7.7 · Process Time hiển thị trong Batch Builder</div>
    <p>Batch Builder cộng <b>Total Qty + Total Surface</b>, resolve Recipe, sau đó gọi Process Time rule. Condition Process Time được kiểm tra trên <b>tất cả Job trong lô</b>. Nếu rule cụ thể không match do trộn value, resolver tìm fallback không condition nếu có.</p>

    <div className="lg-subtitle">7.8 · Create New Batch / Add Existing Batch — flow server</div>
    <Chain steps={[
     {t:"READY selection",d:"Main + Recipe + selected conditions",c:"blue"},
     {t:"Server validate",d:"same Main · live Recipe · conditions · no duplicate",c:"amber"},
     {t:"Batch create/add",d:"Batch No · Key · Jobs · totals",c:"orange"},
     {t:"Process Time",d:"recalculate Qty/Surface/conditions",c:"green"},
     {t:"Recompute Chain",d:"Main kế tiếp READY; later WAIT",c:"teal"},
     {t:"Delta Refresh",d:"chỉ affected Jobs/Matrix",c:"gray"},
    ]}/>
    <ul className="lg-list">
     <li><b>Create New Batch:</b> sinh Batch No theo Prefix/format hệ thống, lưu Recipe, Compatibility Conditions, Batch Key, totals và process_minutes.</li>
     <li><b>Add Existing Batch:</b> kiểm tra Batch cùng Main/Recipe, compatibility với member hiện có, rồi cộng Job/totals/process.</li>
     <li><b>Không full reload:</b> sau create/add chỉ refresh affected Job + Route Matrix và cập nhật Target Batch; giữ scroll/filter/sort của Board.</li>
     <li><b>Clear selection:</b> thoát Batch Selection Mode, tất cả Main/READY trở lại bình thường.</li>
    </ul>

    <div className="lg-subtitle">7.9 · Khi nào cần Rebuild Planning Chain?</div>
    <p>Không cần rebuild chỉ vì tạo Batch hoặc đổi Operation Code Order. Nên rebuild sau thay đổi cấu trúc như ST Scope/Main Mapping/Bridge/Planning chain rule hoặc khi dữ liệu chain cũ được tạo trước logic mới. Rebuild là thao tác nặng và có thể tải lại Candidates.</p>
   </Section>

   <Section id="masking" title="8 · Masking / Unmasking — logic support dùng trong Báo cáo sản xuất"
    sub="Không còn tab planning riêng · Resolver support vẫn chạy theo Main Operation và cấp dữ liệu cho Báo cáo sản xuất">
    <StepList items={[
     <>Từ <b>V454</b>, tab Masking / Unmasking Planning riêng đã được remove khỏi UI/menu. Resolver support vẫn giữ nguyên để cấp đúng Masking/Unmasking cho <b>Báo cáo sản xuất</b>.</>,
     <>Việc phân biệt <b>PRIMER1 / PRIMER2 / PRIMER3</b> và <b>TOPCOAT1 / TOPCOAT2</b> không hard-code theo một raw Operation Code. Resolver dùng chính occurrence đã được Planning Chain chuẩn hóa từ <b>ST Group + thứ tự xuất hiện trong routing</b>. Vì vậy PPRSLVT rồi FULTKAPP vẫn có thể lần lượt là PRIMER1 rồi PRIMER2.</>,
     <>Một support operation chỉ được xét khi nằm vật lý <b>sau Previous Main và trước Current Main</b> của đúng occurrence Job. Không so <code>planning_job_operation.source_seq</code> với Routing Detail vì AllOperation có thể bỏ intermediate như MSKG. Hệ thống dựng lại Main occurrence trực tiếp trên <code>md_routing_detailed</code> bằng cùng ST Operation Mapping + PRIMER/TOPCOAT occurrence, tạo cùng <code>operation_instance_key</code>, rồi lấy MSKG nằm giữa hai Main occurrence vật lý.</>,
     <>Chỉ raw routing operation có chữ <b>MSKG</b> mới được coi là Masking/Unmasking. <b>UNMSKG*</b> = Unmasking; các code MSKG còn lại = Masking. Main Planning có chữ MSKG như FMSKG-CM được loại bằng Operation Type, không bị nhận nhầm thành support.</>,
     <>Cột planner nhìn thấy sử dụng <b>md_routing_detailed.operation_detail_code</b> để phân biệt chi tiết như <code>MSKG-TC_BEFORE_PPRSLVT</code>, <code>UNMSKG_BEFORE_MRKG-IJ</code>... Raw operation_code vẫn được giữ để trace.</>,
     <>Một ngày chuẩn là <b>06:00 ngày D → trước 06:00 ngày D+1</b>; mọi Batch có <code>planned_start</code> nằm trong cửa sổ này thuộc ngày D, kể cả Start 00:00–05:59 của ngày lịch kế tiếp. Masking/Unmasking trong Báo cáo sản xuất dùng đúng cùng boundary với Board Điều Độ.</>,
     <>Batch No., Recipe, Process Time, Start, End và Resource đều lấy từ <b>chính Batch/Schedule của Main phía sau</b>. Tab không lưu một bản thời gian support riêng.</>,
     <>Khi planner đổi ngày/giờ/resource trên Board Điều Độ, Job support trong Báo cáo sản xuất tự chuyển ngày và cập nhật Start/End theo dữ liệu schedule mới ở lần mở/refresh tiếp theo.</>,
     <>Resolver support <b>không thay đổi READY/WAIT, Recipe Resolver, Batch Compatibility hay Scheduling Engine</b>. Đây là derived data dùng cho Báo cáo sản xuất, không còn workspace planning riêng.</>
    ]}/>
    <div className="table-wrap"><table className="erp-table"><thead><tr><th>Thông tin</th><th>Nguồn chuẩn</th><th>Logic</th></tr></thead><tbody>
     <tr><td>Main Planning / Planning Order</td><td><code>planning_job_operation</code> + <code>md_operation_master</code></td><td>Occurrence Main đã chuẩn hóa; PRIMER/TOPCOAT occurrence dùng cùng logic Planning Board.</td></tr>
     <tr><td>Previous Main → Current Main boundary</td><td>Routing Main occurrence + <code>operation_instance_key</code></td><td>Dựng Main occurrence trực tiếp từ Routing Detail, sau đó chỉ lấy support operation nằm giữa source_seq vật lý của hai Main.</td></tr>
     <tr><td>Masking / Unmasking</td><td><code>md_routing_detailed.operation_code</code></td><td>Có MSKG; UNMSKG* là Unmasking, còn lại là Masking; Planning Operation bị loại.</td></tr>
     <tr><td>Support Operation Detail</td><td><code>md_routing_detailed.operation_detail_code</code></td><td>Code chi tiết planner dùng để biết support trước operation nào/lần nào.</td></tr>
     <tr><td>Job / Part / Rev / Qty / Surface / Last / Next / Priority</td><td><code>open_job_current</code></td><td>Thông tin Job hiện tại giống Planning Board.</td></tr>
     <tr><td>Batch / Recipe / Process</td><td><code>planning_batch</code> + <code>md_process_recipe</code></td><td>Luôn là Batch của Current Main mà support phục vụ.</td></tr>
     <tr><td>Ngày / Start / End / Resource</td><td><code>planning_schedule</code></td><td>Support kế thừa lịch điều độ Main; quyền sở hữu ngày lấy theo planned_start trong cửa sổ 06:00→06:00. schedule_date được chuẩn hóa về đúng production date.</td></tr>
    </tbody></table></div>
    <Rule title="Ví dụ 1 · Main thường" tone="important"><code>BSAUNSLD → INSAND-B → MSKG-TC → PPRSLVT</code>. Nếu PPRSLVT là Current Main và Batch được điều độ 05/09 lúc 10:30, Job nằm tại <b>05/09 → PRIMER1 → Masking</b>, support detail của MSKG-TC, cùng Batch No. và Start 10:30.</Rule>
    <Rule title="Ví dụ 2 · Primer khác raw code" tone="important"><code>PPRSLVT → UNMSKG... → MSKG-TC → FULTKAPP</code>. Vì cả PPRSLVT và FULTKAPP thuộc ST Group PRIMER, occurrence đầu là <b>PRIMER1</b>, occurrence sau là <b>PRIMER2</b>. UNMSKG/MSKG nằm giữa hai occurrence được gắn vào <b>PRIMER2</b> và đi theo ngày điều độ của Batch PRIMER2.</Rule>
         <Rule title="Masking / Unmasking theo Main Operation · V451" tone="important">Cấu hình mới cho phép chọn rõ <b>Masking trước Main</b> và <b>Unmasking trước Main</b> theo từng Main Operation. PRIMER occurrence 1/2/3 được chuẩn hóa thành PRIMER1/PRIMER2/PRIMER3; TOPCOAT occurrence 1/2+ thành TOPCOAT1/TOPCOAT2. Khi Main đã có bất kỳ cấu hình support nào, resolver chạy strict cho cả Masking và Unmasking: loại không chọn sẽ không hiện; chỉ Main hoàn toàn chưa cấu hình mới fallback routing. V453 gộp cùng Job và hiển thị các bước theo thứ tự Unmasking → Masking. <b>V454 remove tab Masking / Unmasking Planning riêng</b>; Báo cáo sản xuất tiếp tục dùng resolver này và vẫn lưu trạng thái thực hiện riêng cho từng support step. Không đổi READY / Batch / Recipe / Schedule / Auto Planning.</Rule>
<Rule title="Hiệu năng tải trang · V437">Resolver không quét/rebuild toàn bộ <code>md_routing_detailed</code> khi mở tab. Hệ thống lọc trước Batch/Job thuộc đúng view/ngày đang xem, lấy danh sách Part/Revision liên quan, rồi mới dựng Routing Main + Masking/Unmasking cho tập nhỏ đó. Đây là tối ưu query/index, không đổi boundary Previous Main → Current Main hay logic support.</Rule>
   </Section>

   <Section id="schedule" title="9 · Tab Board Điều Độ — xếp Batch vào resource và thời gian"
    sub="Scheduling nhận Batch từ Planning; không quyết định Recipe membership và không phải điều kiện để mở Main kế tiếp">
    <div className="lg-subtitle">8.1 · Trình tự sử dụng</div>
    <StepList items={[
     <>Chọn <b>Ngày</b> và <b>Planner 1/2</b> → Load. Ownership của Planner lấy từ Schedule Area assignment.</>,
     <>Kiểm tra <b>Unscheduled Batches</b>: đây là các Batch đã được tạo ở Planning nhưng chưa xếp resource/time.</>,
     <>Kéo Batch vào lane/resource phù hợp hoặc chọn dòng, sau đó nhập/đề xuất thời gian.</>,
     <>Với Chemical Line, kiểm tra chuỗi Loading → Process → NDT (nếu có) → Unloading trước Save.</>,
     <>Save schedule; dùng Edit để override giờ/duration nếu cần. Override không sửa Process Time master.</>,
     <>Theo dõi Schedule Table, Production Timeline và Handover Alerts.</>
    ]}/>

    <div className="lg-subtitle">8.2 · Chemical Line timeline</div>
    <Chain steps={[
     {t:"Loading",d:"Qty/Surface Handling Rule",c:"blue"},
     {t:"Process",d:"Batch process_minutes",c:"green"},
     {t:"NDT",d:"Pre-clean rules nếu áp dụng",c:"amber"},
     {t:"Unloading",d:"Qty/Surface Handling Rule",c:"purple"},
     {t:"Resource free",d:"sau Unloading End",c:"gray"},
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Flybar occupancy">Một Flybar bị chiếm liên tục từ Loading Start đến Unloading End.</Rule>
     <Rule title="Loading constraint">Chemical Line dùng chung điểm Loading; lịch trùng Loading bị server chặn.</Rule>
     <Rule title="Process concurrency">Giới hạn process đồng thời theo resource/config (Chemical mặc định dùng max concurrency cấu hình).</Rule>
     <Rule title="NDT">Các recipe pre-clean áp NDT theo rule hiện hành; server kiểm tra khoảng cách/concurrency.</Rule>
     <Rule title="Liên kết FB Preclean 1-1" tone="important">Một FB/Previous Preclean Batch chỉ được liên kết nối tiếp với <b>một</b> FB/dòng downstream. Kéo-thả trùng nguồn bị chặn ngay trên UI; Chemical simulation cũng kiểm tra lại ở server. Cặp nguồn → downstream dùng cùng màu/nhãn liên kết để planner nhìn nhanh. Liên kết vẫn giữ nguyên quy tắc bám NDT End của preclean (hoặc Unloading End khi nguồn không có NDT) và không thay giới hạn Process/NDT.</Rule>
    </div>

    <div className="lg-subtitle">8.3 · Các vùng/lane khác</div>
    <p>Painting và các khu vực khác lấy danh sách lane/resource từ <b>Schedule Area Mapping</b>. Painting hiện hỗ trợ các CAB được cấu hình (hệ thống hiện có CAB1–CAB4 theo Board). Công đoạn chỉ được kéo vào vùng đã map cho Main đó.</p>
    <Rule title="ST Workload Summary · By Area trên Board Điều Độ" tone="important">
     Trên đầu mỗi khu vực điều độ, Board hiển thị bảng workload của chính tập Main Operation được map cho Schedule Area đó. Bảng này <b>không có công thức workload riêng</b>: nó đọc cùng canonical Dashboard ST workload và chỉ lọc theo operation set của Schedule Area. Từ <b>V457</b>, cột READY cũng tách đúng như Planning Board thành <b>READY · Previous Main đã Schedule</b> và <b>READY · Previous Main chưa Schedule / START</b>; hai cột cộng lại đúng READY tổng và không đổi Sequential READY. Các bucket còn lại giữ <b>WAIT / PLANNED-UNSCHEDULED / SCHEDULED / HOLD</b> cùng breakdown Recipe. Các bảng Schedule Area được xếp theo <b>Main Planning Order</b> sớm nhất trong operation pool của khu; display order chỉ làm tie-breaker. Với khu gộp nhiều lane/cabin, hiển thị một bảng chung cho operation pool của khu rồi các lane bên dưới dùng chung context đó.
    </Rule>
    <Rule title="Recipe selector theo Schedule Area" tone="important">
     Danh sách <b>Recipe</b> trong từng khu vực điều độ không còn đọc toàn bộ <code>md_process_recipe</code>. Board lấy các <b>Main Operation được map cho Schedule Area/lane</b>, rồi chỉ hiện Recipe có active <code>md_main_operation_recipe.standard_operation</code> thuộc operation pool đó. Khu gộp nhiều lane (ví dụ Painting/Cabin) dùng union Main Operation của cả khu. Khi sửa một Schedule/Batch cũ, Recipe hiện tại vẫn được giữ trong dropdown để không làm mất giá trị lịch sử nếu mapping đã đổi; nhưng các Recipe ngoài khu vực khác không được đưa vào danh sách chọn mới. Form Create Empty Batch lọc Recipe theo Main Operation đã chọn. Server tạo Batch thủ công cũng revalidate Recipe → Main Operation trước khi lưu. Thay đổi này chỉ giới hạn lựa chọn Recipe trên Board Điều Độ, không đổi Recipe resolver của Planning Board hay Recipe đã lưu trên existing Batch.
    </Rule>
    <Rule title="Khóa Previous Main khi THÊM Batch vào điều độ" tone="important">
     <b>V434 · Unscheduled pool:</b> ngay khi một Batch được chọn/kéo vào một dòng nhập điều độ, Batch đó tạm ẩn khỏi <b>Unscheduled Batches</b> trên toàn khu/lane để không thể chọn trùng. Bấm <b>Xóa nhập</b> thì Batch hiện lại ngay. Sau khi Save, Batch tiếp tục ẩn vì đã có Schedule. Nút <b>Bỏ điều độ</b> chỉ CANCEL Schedule, giữ nguyên Batch + Job và trả Batch về Unscheduled; <b>Delete Batch</b> vẫn là thao tác xóa Batch riêng.
     <br/><br/>
     Chỉ khi <b>thêm một existing Planning Batch</b> vào Board Điều Độ, server kiểm tra vật lý theo từng Job trong Batch. Previous Main được hiển thị theo đúng trạng thái của <b>immediate predecessor occurrence</b>: <b>DONE</b> khi Job đã đi qua Previous Main theo physical Planning progress dù không hề tạo Batch; <b>SCHEDULED</b> khi Previous Main có Batch + Schedule; <b>UNSCHEDULED</b> khi có Batch nhưng chưa điều độ; và <b>NOT_PLANNED</b> khi Previous Main chưa DONE và chưa có Batch. Khi ADD Schedule, <b>DONE không có Batch được xem là đã hoàn tất và được phép đi tiếp</b>. Nếu Previous Main có Batch thì Batch đó vẫn phải có Schedule hợp lệ (không CANCELLED và có <code>planned_end</code>); đồng thời <b>Start của Current Main phải ≥ End của Previous Main</b>. Nếu bất kỳ Job nào chưa DONE/chưa Schedule hoặc Current Start còn sớm hơn Previous End, toàn bộ thao tác Save bị khóa và không insert Schedule. Main đầu tiên không có Previous Main được phép điều độ bình thường. Đây là <b>Scheduling add-only guard</b>, không thay Sequential READY/WAIT của Planning Board. Edit/PATCH lịch đã có và Trial Day Shift không dùng guard này. Với <b>Chemical Line</b>, engine Đề xuất/FB/Loading/Process/NDT/Unloading hiện tại giữ nguyên; server chỉ kiểm tra trạng thái Previous Main + <b>effective Start cuối cùng</b> ngay trước khi Save nên không thay công thức đề xuất Chemical Line.
    </Rule>
    <Rule title="Trial · Dời toàn bộ ngày điều độ" tone="important">
     Nút <b>Dời toàn bộ lịch → +1 ngày</b> trên Board Điều Độ dùng để tiếp tục một ngày test sang ngày kế tiếp. Từ V445, <b>Production Day là boundary chuẩn duy nhất của toàn app: 06:00 ngày D → trước 06:00 ngày D+1</b>. Quyền sở hữu ngày dựa trên <code>planned_start</code>: lô Start 00:00–05:59 của ngày lịch kế tiếp vẫn thuộc ngày D; nếu End kéo qua 06:00 thì lô vẫn thuộc ngày D vì Start nằm trong ngày D. Board Điều Độ, Timeline, Masking/Unmasking, Production Execution, daily Dashboard/AI đều dùng cùng boundary này. <code>schedule_date</code> được chuẩn hóa thành production date bằng local Start trừ 6 giờ. Trial shift vẫn <b>MOVE in-place</b>, không clone Batch/Schedule; Resource, Recipe, Duration, Sequence và toàn bộ timestamp Chemical Line <b>Loading / Process / NDT / Unloading</b> dịch cùng đúng ±1 ngày. Sau commit ngày sản xuất nguồn phải rỗng. Nếu ngày sản xuất đích thực sự có lịch độc lập, có RUNNING/COMPLETED hoặc có lịch khác chạy xuyên khoảng đích thì rollback toàn bộ. Planning Chain/Candidate/Batch membership/Recipe không thay đổi.
    </Rule>

    <div className="lg-subtitle">8.4 · Schedule Table / Timeline / Planner</div>
    <ul className="lg-list">
     <li><b>Schedule Table · Planner:</b> danh sách Batch đã xếp của Planner đang chọn.</li>
     <li><b>Schedule Table · Tổng hợp:</b> xem cả Planner 1 + Planner 2 trong ngày.</li>
     <li><b>Production Timeline:</b> ngày sản xuất 06:00 → 06:00 hôm sau, có thể mở rộng nếu chuỗi kéo dài.</li>
     <li><b>Handover Alerts:</b> thay đổi từ Planner khác có ảnh hưởng công đoạn của bạn được hiển thị/acknowledge; client refresh theo chu kỳ.</li>
     <li><b>Continuation:</b> có thể nối lô sau trên cùng resource khi thỏa rule/handoff hoặc planner tạo liên kết thủ công theo UI.</li>
    </ul>

    <Rule title="Scheduling không mở READY" tone="important">
     Logic Sequential READY hiện coi <b>Batch UNSCHEDULED</b> đã là handoff. Do đó Scheduling chỉ quyết định <b>khi nào / resource nào</b> chạy; không dùng để quyết định Job có được mở Main kế tiếp hay không.
    </Rule>
   </Section>

   <Section id="import" title="10 · Tab Import Master — đồng bộ dữ liệu kỹ thuật"
    sub="Khác Import All Open Job: tab này cập nhật Master Part/Routing/Finish và chỉ các Process Requirement thực sự cần">
    <div className="lg-key lg-key-2">
     <Rule title="Lần đầu">Full Import.</Rule>
     <Rule title="Từ lần sau">Part/Routing/Finish vẫn incremental NEW/CHANGED. Riêng Process Requirement cần thiết vẫn được đọc ở cả UNCHANGED để hỗ trợ filtered rebuild sau cleanup.</Rule>
    </div>
    <StepList items={[
     <>Chọn file Master Excel đúng format.</>,
     <>Bấm <b>Import Master</b>; chờ thống kê Source / New / Changed / Unchanged / Routing và số Process Requirement thực sự được ghi.</>,
     <>Importer chỉ rebuild các ST derived data/routing signature bị ảnh hưởng theo logic incremental hiện tại.</>,
     <>Nếu cần cập nhật lại chuỗi công đoạn sau import, hệ thống tiếp tục tự xử lý; nếu bị gián đoạn, vào ST Operation Flow để tiếp tục.</>,
     <>Sau import, dùng Part Tracker kiểm tra Routing/Finish và các Requirement đang được Rule/Keep yêu cầu.</>,
     <>Nếu cấu trúc/value All Open Job cũng thay đổi thì đó là luồng import riêng ở tab All Open Jobs; đừng nhầm hai file.</>
    ]}/>
    <Rule title="Reset All Master Data" tone="warning">
     Dùng rất thận trọng. UI sẽ yêu cầu xác nhận; reset Master/Lịch sử Import theo API hiện hành và giữ lại ST Operation Scope hệ thống. Sau reset phải import Master lại và kiểm tra derived routing/mapping trước khi Planning.
    </Rule>
   </Section>

   <Section id="production" title="11 · Production Execution — production worklist & completion reporting"
    sub="Reads scheduled Batch + Masking / Unmasking work; stores execution status separately from Planning and Scheduling">
    <Chain steps={[
     {t:"Scheduling Board",d:"Batch · Resource · Planned Start/End",c:"blue"},
     {t:"Masking / Unmasking",d:"Derived support work",c:"teal"},
     {t:"Production Execution",d:"WAITING → ON-GOING → DONE",c:"green"},
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Production status is separate from Schedule status" tone="important">WAITING / ON-GOING / DONE is an execution report only. Updating it does not change planning_schedule, Batch state, READY/WAIT, or Planning Chain.</Rule>
     <Rule title="Production Day · V445/V446/V449" tone="important">Production Execution hiển thị toàn bộ kế hoạch theo ngày sở hữu chuẩn duy nhất: <code>((planned_start giờ Việt Nam) - 6 giờ)::date</code>. Tương đương 06:00 ngày D đến trước 06:00 ngày D+1. Ví dụ Start <b>04/09 05:50</b> thuộc báo cáo <b>03/09</b>; Start <b>05/09 05:50</b> thuộc báo cáo <b>04/09</b>. End có thể kéo qua 06:00 nhưng ownership không đổi. V446 date navigation remount dữ liệu theo ngày mới ngay khi bấm Trước/Tiếp/Hôm nay, không cần F5. V449 hiển thị thêm ngày lịch ở mốc sau nửa đêm để tránh nhầm 05:50 của ngày nào.</Rule>
     <Rule title="Mixed reporting granularity · V447" tone="important">Chemical Line và Painting báo cáo trực tiếp theo từng dòng kế hoạch/Batch trên bảng chính, không mở danh sách Job để nhập trạng thái. Các khu vực còn lại vẫn báo cáo từng Job độc lập WAITING → ON-GOING → DONE trong <code>production_execution_job</code>; dòng Batch/Main chỉ là summary tương thích.</Rule>
     <Rule title="Planned data remains live">Batch No., Recipe, Qty, Surface, Resource and Planned Time are read from the existing Planning/Scheduling sources. Mốc kế hoạch được hiển thị ngay trước Actual Start/End; mỗi Job có thêm Shift: Ca 1 06:00–14:00, Ca 2 14:00–22:00, Ca 3 22:00–05:59 ngày hôm sau.</Rule>
     <Rule title="Production sub-tabs + area color · V447">Báo cáo sản xuất có sub-tab: Chemical Line; Shot Peening (Auto + Manual); Masking &amp; Unmasking; Painting; Sirius Cleaning; Blasting (Manual + Auto); Plating (Plating + He-Bake); Passivation / Brightening. Tiêu đề từng bảng khu vực dùng màu nhận dạng riêng. Tất cả bảng tiếp tục không có inner vertical scroll; cuộn dọc dùng trang chính.</Rule>
     <Rule title="Report panel grouping · V448 / V455" tone="important">UI bảng báo cáo được tăng khoảng cách, viền/màu tiêu đề và nền header để phân biệt rõ từng nhóm. Từ <b>V455</b>, trong sub-tab <b>Masking &amp; Unmasking</b>, các Preparation Job được gom theo <b>Khu vực vật lý của Main Planning liên kết</b>, không còn tạo panel riêng theo từng Main. Ví dụ PRIMER1/PRIMER2/TOPCOAT1/TOPCOAT2 cùng thuộc Painting sẽ nằm chung panel <code>Painting (Preparation)</code>; cột Main trong từng Job vẫn giữ rõ công đoạn đích. Mỗi Job vẫn gộp các bước theo thứ tự Unmasking → Masking và từng support step giữ trạng thái execution riêng. Trong sub-tab <b>Painting</b>, dữ liệu Main được chia thành đúng 4 panel: <b>CAB1</b>, <b>CAB2</b>, <b>CAB3</b>, <b>Powercoating</b>. Không đổi dữ liệu hay trạng thái Planning/Schedule.</Rule>
     <Rule title="Compact Batch blocks + Production Note · V450" tone="important">Báo cáo dài được tối giản để dễ quét theo Batch: bỏ cột <b>Công đoạn</b> ở dòng Batch và bỏ <b>Công đoạn trước / Công đoạn kế tiếp</b> ở Job detail, đồng thời tăng separator giữa các Batch. Thêm cột <b>Ghi chú</b>: Chemical Line/Painting lưu ghi chú theo dòng vào <code>production_execution.remark</code>; các khu vực báo cáo theo Job lưu ghi chú riêng từng Job vào <code>production_execution_job.remark</code>. Ghi chú là dữ liệu thực thi, không thay đổi Planning Chain, Batch, Recipe hay Schedule.</Rule>
     <Rule title="Hiệu năng tải trang · V437">Production Execution dùng cùng resolver Masking/Unmasking đã thu hẹp theo ngày/Batch/Part-Rev và không còn chạy thêm một vòng <code>array_agg</code> Job Number theo từng Batch; Job Number được tái sử dụng từ Batch Job detail đã tải. Business status WAITING/ON-GOING/DONE không đổi.</Rule>
    </div>
   </Section>

   <Section id="dashboard" title="12 · Operations Dashboard & AI — Groq primary / OpenRouter fallback"
    sub="Deterministic KPI first; Groq is primary, OpenRouter is automatic fallback, and both use the same controlled read-only database tools">
    <Chain steps={[
     {t:"Operational Sources",d:"Open Jobs · Planning Chain · Batch · Schedule · Execution",c:"blue"},
     {t:"Dashboard KPI Engine",d:"Counts · workload · delay · conflict · 7-day trend",c:"teal"},
     {t:"AI Provider Router",d:"Groq → OpenRouter + read-only DB tools",c:"green"},
     {t:"Planner / Manager",d:"Review and decide",c:"orange"},
    ]}/>
    <div className="lg-key lg-key-2">
     <Rule title="Dashboard remains deterministic" tone="important">Open Jobs, READY, Unscheduled Backlog, Scheduled Today, Execution WAITING / ON-GOING / DONE, delayed work, resource load and schedule conflicts are calculated by application / SQL logic. AI does not calculate or replace these source-of-truth values.</Rule>
     <Rule title="ST workload chart layout">Chart population is the post-resolver ST Scope result: Planning Operation, Bridge-validated Intermediate that is in ST Scope, and ST_SCOPE_ONLY. <b>TOTAL / ALL ST</b> uses the same calculated total but is displayed in a separate summary zone on the right; it is not part of the operation sequence or Qty trend line. Combo chart dùng viewBox ngang rộng hơn và không còn bị max-height co chiều ngang, nên tận dụng toàn bộ bề rộng panel Dashboard.</Rule>
     <Rule title="AI providers are read-only">Groq is primary and OpenRouter is fallback. Both start with the structured Dashboard snapshot and use the same controlled read-only tools for public application tables/views, Job context, Batch context, daily operations and ST logic. No write tool is exposed, so AI cannot create/delete Batch, change Recipe, move Schedule, change READY/WAIT, edit configuration or update Production Execution.</Rule>
     <Rule title="AI connection is explicit">Dashboard shows Groq and OpenRouter connection state separately and provides <b>Test connection</b>. Groq remains primary; OpenRouter is marked ready as fallback when configured. API keys never reach the browser.</Rule>
     <Rule title="AI data access is visible">The AI panel shows the initial Dashboard snapshot plus database access mode. Ask AI can discover/read application tables and aggregate filtered data through validated tools, but cannot execute arbitrary SQL. Every answer reports which tools/tables were used and how many rows were inspected.</Rule>
     <Rule title="Conversation keeps context, not new facts">Ask AI keeps recent user/assistant turns for follow-up questions. Previous AI answers are conversation context only; factual evidence must come from the current Dashboard snapshot or database tool results from the current request.</Rule>
     <Rule title="Provider fallback does not block operations">If Groq is unavailable, rate-limited or times out, the same request automatically falls back to OpenRouter when OPENROUTER_API_KEY is configured. If both providers are unavailable, the normal Dashboard still loads and all deterministic KPI remain usable.</Rule>
     <Rule title="Server-side provider configuration">GROQ_API_KEY / GROQ_MODEL configure the primary provider. OPENROUTER_API_KEY / OPENROUTER_MODEL configure fallback (default openrouter/free). AI_MAX_TOOL_ROUNDS limits database tool rounds (default 4). All provider keys remain server-side.</Rule>
    </div>
    <StepList items={[
     <>Open <b>Operations → Dashboard</b> and select the production date.</>,
     <>Review Operations Health, KPI, Area Execution, Resource Workload, delayed risk, READY queue and 7-day trend.</>,
     <>The AI panel automatically analyzes the same date snapshot after the Dashboard loads. Groq is tried first; OpenRouter is used only when fallback is required.</>,
     <>Use <b>Test connection</b> to verify provider/model/tool readiness and open <b>AI data access</b> to see the read-only database boundary.</>,
     <>Use a suggested question or type a question in <b>Ask AI</b>. For specific Job/Batch/Area/Resource/logic questions, the agent calls the minimum read-only tools needed. The input clears immediately after Enter/Ask and the answer is appended to the visible conversation history.</>,
     <>Under each AI answer, review <b>Data used for this answer</b> to see tool names, tables and inspected row counts.</>,
     <>Use <b>Refresh AI</b> when operational data changes. Treat AI recommendations as decision support and confirm the affected Batch / Resource / Job in the source screen before making an operational change.</>
    ]}/>
   </Section>

   <Section id="impact" title="13 · Impact Matrix — sửa ở đâu thì phía sau thay đổi gì?"
    sub="Bảng này dùng trước khi chỉnh cấu hình production để biết phạm vi ảnh hưởng">
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Thay đổi</th><th>Ảnh hưởng trực tiếp</th><th>Ảnh hưởng phía sau</th><th>Cần làm sau đó</th></tr></thead>
     <tbody>
      <tr><td>Operation Code Order</td><td>Tie-break RAW NextOperation trong cùng Main.</td><td>Không đổi chain/READY/Recipe/Batch.</td><td>Reload/refresh Board; không Rebuild Chain.</td></tr>
      <tr><td>Main Planning Order</td><td>Thứ tự Main canonical nội bộ.</td><td>Có thể đổi Previous/Next Main và READY/WAIT.</td><td>Kiểm tra mapping; Rebuild Chain.</td></tr>
      <tr><td>Add/Remove ST Scope</td><td>Job visibility + operation classification.</td><td>Có thể đổi All Open Jobs/Planning Chain.</td><td>Rebuild derived chain khi cần.</td></tr>
      <tr><td>Source → Main Mapping</td><td>Raw op map sang Main nào.</td><td>Route Matrix, Recipe context, Area/Schedule.</td><td>Rebuild/kiểm tra chain + Part Tracker.</td></tr>
      <tr><td>Bridge Segment</td><td>Định vị physical pair giữa Main.</td><td>Current physical anchor/chain occurrence.</td><td>Rebuild Planning Chain.</td></tr>
      <tr><td>Recipe Mapping / Selection Rule</td><td>Recipe đề xuất + Batch Compatibility checkbox.</td><td>Create/Add Batch có thể pass/fail khác.</td><td>Test READY Job; Existing Batch không tự đổi Recipe.</td></tr>
      <tr><td>Batch Compatibility checkbox</td><td>Mở rộng/thu hẹp Job cùng Recipe được gom.</td><td>Lưu subset condition vào Batch.</td><td>Không đổi Recipe rule hay Process Time rule.</td></tr>
      <tr><td>Process Time Rule</td><td>process_minutes của Batch.</td><td>Schedule suggestion/duration chuẩn.</td><td>Batch unscheduled của Recipe có thể được refresh.</td></tr>
      <tr><td>Loading/Unloading Rule</td><td>Handling duration Chemical.</td><td>Resource occupancy/conflict/timeline.</td><td>Kiểm tra lịch Chemical mới.</td></tr>
      <tr><td>Schedule Area</td><td>Lane, Main và danh sách Recipe được phép chọn trên Board Điều Độ.</td><td>Unscheduled Batch xuất hiện/kéo được ở đâu; Recipe dropdown chỉ lấy Recipe map tới Main của area.</td><td>Kiểm tra Main mapping + Recipe mapping + Planner assignment.</td></tr>
      <tr><td>Planner Assignment</td><td>Ai thấy/điều độ area.</td><td>Handover alert/Planner view.</td><td>Không rebuild routing.</td></tr>
      <tr><td>Import All Open Job</td><td>NextOperation/LastOperation/source_data mới.</td><td>Candidate/Recipe/condition/physical progress.</td><td>Scan Column Values nếu có cột/value mới.</td></tr>
      <tr><td>Import Master</td><td>Part/Rev/Routing/Finish + filtered Process Requirement.</td><td>Part Tracker, route, recipe master-condition lookup.</td><td>Requirement chỉ import theo active MD:REQ + Manual Keep; kiểm tra changed Part và derived Bridge.</td></tr>
      <tr><td>Dashboard / AI provider config</td><td>Dashboard analysis and AI narrative.</td><td>Does not change Planning / Batch / Schedule / Execution source data.</td><td>Refresh Dashboard / Refresh AI; no Rebuild Chain.</td></tr>
     </tbody>
    </table></div>
   </Section>

   <Section id="live" title="14 · Mapping đang chạy — đọc trực tiếp database"
    sub="Dùng để đối chiếu tài liệu với cấu hình production hiện tại; bảng này không phải dữ liệu mẫu">

    <div className="notice">
     <b>Live DB:</b> đã đọc trực tiếp {12-Object.keys(liveErrors).filter(k=>k!=="page").length}/12 nhóm dữ liệu. Mỗi bảng được đọc độc lập nên một bảng lỗi không còn làm trắng toàn bộ phần Mapping.
    </div>

    <div className="lg-subtitle">14.0 · Bảng kết nối tổng hợp — Main Operation → Recipe → Schedule → Planner</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Main Operation</th><th>ST Group</th><th>Batch Prefix</th><th>Planning Order</th><th>Source Ops</th><th>Recipe Rules</th><th>Schedule Area</th><th>Planner</th></tr></thead>
     <tbody>{mainLinks.map((x:any,i)=><tr key={`main-link-${i}`}>
      <td><b>{x.standard_operation}</b></td><td>{x.st_group||"—"}</td><td className="mono">{x.batch_prefix||"—"}</td><td className="num">{x.planning_sort_order??"—"}</td><td className="num">{x.source_count??0}</td><td className="num">{x.recipe_count??0}</td><td>{x.schedule_areas||"—"}</td><td>{x.planners||"—"}</td>
     </tr>)}{!mainLinks.length&&<tr><td colSpan={8} className="muted">{liveErrors.mainLinks?`Lỗi đọc database: ${liveErrors.mainLinks}`:"Database hiện chưa có dữ liệu kết nối Main Operation."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.0.1 · Bảng kết nối tổng hợp — ST Group → Area → Schedule Area → Planner</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>ST Group</th><th>Tên nhóm</th><th>Main Operations</th><th>Physical Area</th><th>Schedule Area</th><th>Planner</th></tr></thead>
     <tbody>{groupLinks.map((x:any,i)=><tr key={`group-link-${i}`}>
      <td className="mono"><b>{x.st_group}</b></td><td>{x.group_name||"—"}</td><td>{x.main_operations||"—"}</td><td>{x.areas||"—"}</td><td>{x.schedule_areas||"—"}</td><td>{x.planners||"—"}</td>
     </tr>)}{!groupLinks.length&&<tr><td colSpan={6} className="muted">{liveErrors.groupLinks?`Lỗi đọc database: ${liveErrors.groupLinks}`:"Database hiện chưa có dữ liệu kết nối ST Group."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.1 · Main Operation — Planning Order nội bộ + Batch Prefix</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Main Operation</th><th>ST Group</th><th>Batch Prefix</th><th>Main Planning Order</th><th>Active</th></tr></thead>
     <tbody>{mainOps.map((x:any,i)=><tr key={`${x.standard_operation}-${i}`}>
      <td><b>{x.standard_operation}</b></td><td>{x.st_group||"—"}</td><td className="mono">{x.batch_prefix||"—"}</td><td className="num">{x.planning_sort_order??"—"}</td><td>{x.is_active?badge("YES","green"):badge("NO","warning")}</td>
     </tr>)}{!mainOps.length&&<tr><td colSpan={5} className="muted">{liveErrors.mainOps?`Lỗi đọc database: ${liveErrors.mainOps}`:"Database hiện chưa có Main Operation."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.2 · Operation Code Order — tie-breaker trong cùng Main</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Operation Code</th><th>Loại</th><th>Operation Name</th><th>Operation Code Order</th></tr></thead>
     <tbody>{nextOps.map((x:any,i)=><tr key={`${x.operation_code}-${i}`}>
      <td><b>{x.operation_code}</b></td><td>{x.operation_type}</td><td>{x.operation_name||"—"}</td><td className="num"><b>{x.planning_sort_order??"—"}</b></td>
     </tr>)}{!nextOps.length&&<tr><td colSpan={4} className="muted">{liveErrors.nextOps?`Lỗi đọc database: ${liveErrors.nextOps}`:"Database hiện chưa có Operation Code trong scope."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.3 · Source → Main Mapping</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>ST Group</th><th>Source Operation</th><th>Main/Rule</th><th>Mapping Rule</th></tr></thead>
     <tbody>{mappings.map((m:any,i)=><tr key={i}><td>{m.st_group}</td><td className="mono">{m.source_operation_code}</td><td>{m.standard_operation_rule||"—"}</td><td>{m.mapping_rule||"—"}</td></tr>)}
      {!mappings.length&&<tr><td colSpan={4} className="muted">{liveErrors.mappings?`Lỗi đọc database: ${liveErrors.mappings}`:"Database hiện chưa có Source → Main Mapping."}</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">14.4 · Operation Code → Recipe Mapping runtime</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Rule ID</th><th>Operation Code</th><th>Main</th><th>Recipe Key</th><th>Priority</th><th>Default</th><th>Selection Rule</th></tr></thead>
     <tbody>{recipeMaps.map((m:any,i)=><tr key={i}>
      <td className="mono">#{m.mapping_id}</td><td><b>{m.operation_code}</b></td><td>{m.standard_operation||"—"}</td><td className="mono">{m.recipe_key}</td><td className="num">{m.priority??100}</td><td>{m.is_default?badge("YES","green"):"—"}</td><td>{m.selection_rule||"—"}</td>
     </tr>)}{!recipeMaps.length&&<tr><td colSpan={6} className="muted">{liveErrors.recipeMaps?`Lỗi đọc database: ${liveErrors.recipeMaps}`:"Database hiện chưa có Recipe mapping."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.5 · Recipe Catalog</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Recipe No</th><th>Recipe Name</th><th>Family</th><th>Operation mapping đầu tiên</th></tr></thead>
     <tbody>{recipes.map((r:any,i)=><tr key={i}><td className="mono"><b>{r.recipe_no||"—"}</b></td><td>{r.recipe_name||"—"}</td><td>{r.process_family||"—"}</td><td>{r.default_operation?badge(String(r.default_operation),"green"):badge("Chưa map","warning")}</td></tr>)}
      {!recipes.length&&<tr><td colSpan={4} className="muted">{liveErrors.recipes?`Lỗi đọc database: ${liveErrors.recipes}`:"Database hiện chưa có Recipe."}</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">14.6 · Process Time Rules</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Recipe</th><th>Mode</th><th>Priority</th><th>Qty</th><th>Surface dm²</th><th>Fixed</th><th>Standard</th></tr></thead>
     <tbody>{timeRules.map((r:any,i)=><tr key={i}>
      <td className="mono">{r.recipe_key}</td><td>{r.calc_type}</td><td className="num">{r.priority}</td><td className="mono">{r.qty_min??"—"} – {r.qty_max??"—"}</td><td className="mono">{r.surface_min_dm2??"—"} – {r.surface_max_dm2??"—"}</td><td>{r.fixed_hours??"—"}</td><td>{r.standard_hours??"—"}</td>
     </tr>)}{!timeRules.length&&<tr><td colSpan={7} className="muted">{liveErrors.timeRules?`Lỗi đọc database: ${liveErrors.timeRules}`:"Database hiện chưa có Process Time Rule."}</td></tr>}</tbody>
    </table></div>

    <div className="lg-subtitle">14.7 · Loading / Unloading Rules</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Phase</th><th>Priority</th><th>Qty</th><th>Surface dm²</th><th>Minutes</th></tr></thead>
     <tbody>{handlingRules.map((r:any,i)=><tr key={i}><td>{r.phase}</td><td className="num">{r.priority}</td><td>{r.qty_min??"—"} – {r.qty_max??"—"}</td><td>{r.surface_min_dm2??"—"} – {r.surface_max_dm2??"—"}</td><td className="num"><b>{r.duration_minutes}</b></td></tr>)}
      {!handlingRules.length&&<tr><td colSpan={5} className="muted">{liveErrors.handlingRules?`Lỗi đọc database: ${liveErrors.handlingRules}`:"Database hiện chưa có Handling Time Rule."}</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">14.8 · Physical Area / ST Group</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Area</th><th>ST Groups</th></tr></thead>
     <tbody>{areas.map((a:any,i)=><tr key={i}><td><b>{a.area_name}</b><small className="planning-sub"> {a.area_code}</small></td><td>{a.st_groups}</td></tr>)}
      {!areas.length&&<tr><td colSpan={2} className="muted">{liveErrors.areas?`Lỗi đọc database: ${liveErrors.areas}`:"Database hiện chưa có Area."}</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">14.9 · Schedule Area → Planner → Main Operation</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Schedule Area</th><th>Resource Group</th><th>Resource</th><th>Rows</th><th>Planner</th><th>Main Operations</th></tr></thead>
     <tbody>{scheduleAreas.map((s:any,i)=><tr key={i}><td><b>{s.schedule_area_name}</b><small className="planning-sub"> {s.schedule_area_code}</small></td><td>{s.resource_group||"—"}</td><td>{s.resource_code||"—"}</td><td className="num">{s.default_rows}</td><td>{s.planner_owner||"—"}</td><td>{String(s.operations||"").split(", ").map((o:string)=><span key={o}>{badge(o,"blue")} </span>)}</td></tr>)}
      {!scheduleAreas.length&&<tr><td colSpan={6} className="muted">{liveErrors.scheduleAreas?`Lỗi đọc database: ${liveErrors.scheduleAreas}`:"Database hiện chưa có Schedule Area."}</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">14.10 · Schedule Resources</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Resource</th><th>Group</th><th>Sort</th><th>Max Concurrent</th></tr></thead>
     <tbody>{resources.map((r:any,i)=><tr key={i}><td><b>{r.resource_code}</b><small className="planning-sub"> {r.resource_name||""}</small></td><td>{r.resource_group||"—"}</td><td className="num">{r.sort_order}</td><td className="num">{r.max_concurrent||"—"}</td></tr>)}
      {!resources.length&&<tr><td colSpan={4} className="muted">{liveErrors.resources?`Lỗi đọc database: ${liveErrors.resources}`:"Database hiện chưa có Schedule Resource."}</td></tr>}
     </tbody>
    </table></div>
   </Section>

   <Section id="database-provider" title="15 · Database Provider · Aiven PostgreSQL (V438)"
    sub="Provider hạ tầng thay đổi; business logic ST Planning giữ nguyên">
    <StepList items={[
     <>Database runtime chuẩn dùng <b>Aiven PostgreSQL</b> qua <code>DATABASE_URL</code> và driver <code>pg</code>. Không còn Supabase/Supavisor DNS fallback hoặc Transaction Pooler logic trong tầng database.</>,
     <>Giai đoạn chuyển đổi đầu tiên copy <b>toàn bộ public schema + toàn bộ public data hiện hành</b> từ Supabase sang Aiven. Chưa xóa history, chưa giảm Routing Detail, chưa dọn index trước khi cutover.</>,
     <>Vì Aiven Free có connection budget nhỏ, Vercel đặt <code>DB_POOL_MAX=1</code> mặc định. Chỉ tăng sau khi đo concurrency thực tế.</>,
     <>Supabase có thể được giữ tạm cho <b>Storage/Auth</b> trong giai đoạn migration; Master/Planning/Open Job/Batch/Schedule/Dashboard database read/write phải đi Aiven.</>,
     <>Chỉ đổi Vercel sang Aiven sau khi restore + row-count verify thành công. Sau cutover ổn định mới thực hiện phase giảm database/index/history.</>
    ]}/>
    <Rule title="Không đổi nghiệp vụ" tone="important">Provider move không thay Planning Chain READY/WAIT, Recipe Resolver, Batch Compatibility, Previous Main Schedule Lock, Chemical Line proposal/capacity, Masking/Unmasking resolver hay Production Execution.</Rule>
   </Section>

   <Section id="faq" title="16 · FAQ / Chẩn đoán nhanh">
    <Faq q="Vì sao Next Operation không sort theo chữ ABC?" a={<>Đó là chủ ý. Khi Sort Priority dùng <b>NextOperation</b>, Board resolve RAW NextOperation → Main và dùng <b>Main Planning Order</b>. Operation Code Order chỉ tie-break trong cùng Main. Kiểm tra Cấu hình → Main Operation và ST Scope.</>}/>
    <Faq q="Vì sao một Job READY nhưng click xong các READY khác bị mờ?" a={<>Bạn đang ở <b>Batch Selection Mode</b>. Main khác bị dim; cùng Main nhưng khác Recipe hoặc không thỏa các condition đang tích cũng bị dim/disable. Clear Selection để thoát mode.</>}/>
    <Faq q="Vì sao không thấy checkbox condition trong Batch Compatibility?" a={<>Checkbox lấy từ <b>Operation Code → Recipe → Điều kiện áp dụng cho Job</b> của đúng Recipe mapping. Process Time condition không tạo checkbox. Nếu mapping Recipe không có condition, panel sẽ báo chỉ khóa theo Recipe.</>}/>
    <Faq q="Tôi bỏ tích hết condition thì có trộn Recipe được không?" a={<>Không. Empty condition subset chỉ có nghĩa là <b>same Main + same Recipe</b>. Recipe khác vẫn bị server chặn.</>}/>
    <Faq q="Vì sao Main kế tiếp READY dù Batch trước chưa Schedule?" a={<>Theo Sequential READY hiện tại, Batch <b>PLANNED-UNSCHEDULED</b> đã là handoff hợp lệ. Scheduling chỉ xếp resource/time; không phải gate mở Main kế tiếp.</>}/>
    <Faq q="Vì sao Main xa hơn vẫn WAIT?" a={<>Chỉ immediate next Main được mở sau handoff. Các Main sau nữa giữ WAIT cho đến khi chuỗi previous liên tục đã có Batch/DONE.</>}/>
    <Faq q="Tạo Batch xong có reload toàn Board không?" a={<>Không. Luồng hiện tại dùng <b>Delta Refresh</b> cho affected Job/Route Matrix và refresh Target Batch. Rebuild Chain mới là thao tác có thể tải lại nhiều dữ liệu.</>}/>
    <Faq q="Recipe đúng nhưng Process Time = — / chưa xác định?" a={<>Kiểm tra Cấu hình → Thời gian xử lý. Batch có thể không match range Qty/Surface hoặc condition cụ thể; cần rule fallback không condition nếu muốn có thời gian cho trường hợp trộn value.</>}/>
    <Faq q="Job không xuất hiện ở All Open Jobs ST?" a={<>Kiểm tra RAW <b>NextOperation</b> của Job có thuộc operational ST Scope <b>PLANNING_OPERATION</b> hoặc <b>ST_SCOPE_ONLY</b> hay không. INTERMEDIATE Dashboard ST không làm Job xuất hiện ở tab All Open Jobs.</>}/>
    <Faq q="Job xuất hiện All Open Jobs nhưng không có READY?" a={<>Có thể Operation là ST_SCOPE_ONLY, chain chưa resolve, Main phía trước còn WAIT/gap, hoặc dữ liệu Last/Next/AllOperation/Bridge không định vị được. Với raw Operation lặp lại nhiều occurrence, hệ thống ưu tiên occurrence sớm nhất chưa có Batch. Kiểm tra Route Matrix/NO CHAIN, Job Tracker và ST Operation Flow để xác định vị trí của Job.</>}/>
    <Faq q="Đổi Operation Code Order có cần Rebuild Chain?" a={<>Không. Operation Code Order chỉ dùng tie-break presentation. Rebuild Chain chỉ cần cho thay đổi cấu trúc Planning/Mapping/Bridge/Scope.</>}/>
    <Faq q="Ngưng Main Operation có mất Batch lịch sử không?" a={<>Không. Ngưng giữ lịch sử. Xóa vĩnh viễn chỉ được phép khi đã ngưng và không còn dependency; API sẽ chặn và báo các nhóm còn tham chiếu.</>}/>
    <Faq q="Import Master và Import All Open Job khác gì?" a={<>Import Master = dữ liệu kỹ thuật Part/Revision/Routing/Finish/Requirement. Import All Open Job = snapshot WIP/job thực tế. Hai luồng độc lập nhưng gặp nhau tại Planning resolver.</>}/>
   </Section>

  </section>
 </main>;
}
