import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

// =====================================================================
// LOGIC & HƯỚNG DẪN — tài liệu vận hành trực quan.
// Đọc dữ liệu CẤU HÌNH THẬT từ database để ai cũng thấy mapping đang chạy.
// =====================================================================

const badge=(text:string,kind="blue")=>
 <span className={`guide-badge guide-badge-${kind}`}>{text}</span>;

function FlowStep({n,title,sub}:{n:string;title:string;sub:string}){
 return <div className="guide-flow-step">
  <span className="guide-flow-no">{n}</span>
  <div><b>{title}</b><small>{sub}</small></div>
 </div>;
}

function Rule({title,children,tone="normal"}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){
 return <div className={`guide-rule guide-rule-${tone}`}>
  <b>{title}</b>
  <div>{children}</div>
 </div>;
}

// Chuỗi ngang (dùng cho flowchart dữ liệu)
function Chain({steps}:{steps:{t:string;d?:string;c?:string}[]}){
 return <div className="lg-chain">
  {steps.map((s,i)=><span className="lg-chain-item" key={i}>
   <span className={`lg-chain-box lg-chain-${s.c||"blue"}`}>{s.t}{s.d&&<small>{s.d}</small>}</span>
   {i<steps.length-1&&<span className="lg-chain-arrow">➜</span>}
  </span>)}
 </div>;
}

// Chuỗi dọc (chemical chain)
function VertChain({steps}:{steps:{t:string;d:string;c:string;note?:string}[]}){
 return <div className="lg-vert">
  {steps.map((s,i)=><div className="lg-vert-step" key={i}>
   <div className={`lg-vert-box lg-vert-${s.c}`}>
    <b>{s.t}</b><span>{s.d}</span>
   </div>
   {s.note&&<small className="lg-vert-note">{s.note}</small>}
   {i<steps.length-1&&<div className="lg-vert-arrow">▼</div>}
  </div>)}
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

export default async function Page(){
 const db=await getPool().connect();
 let mappings:any[]=[],areas:any[]=[],scheduleAreas:any[]=[],operationOrders:any[]=[],recipes:any[]=[];
 let recipeMaps:any[]=[],timeRules:any[]=[],handlingRules:any[]=[],resources:any[]=[];
 let error="";
 try{
  const [mappingQ,areaQ,scheduleQ,orderQ,recipeQ,recipeMapQ,timeQ,handlingQ,resourceQ]=await Promise.all([
   db.query(`
    select m.sort_order,m.source_operation_code,m.st_group,m.standard_operation_rule,m.mapping_rule
    from md_st_operation_mapping m
    join md_st_operation_scope scope
      on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
     and scope.is_active=true and scope.operation_type='PLANNING_OPERATION'
    where m.is_active=true order by m.st_group,m.sort_order,m.source_operation_code`),
   db.query(`
    select a.id,a.area_code,a.area_name,a.sort_order,
     coalesce(string_agg(g.st_group,', ' order by g.st_group) filter(where g.st_group is not null),'—') st_groups
    from md_area a
    left join md_area_operation_group g on g.area_id=a.id and g.is_active=true
    where a.is_active=true group by a.id order by a.sort_order,a.area_code`),
   db.query(`
    select s.schedule_area_code,s.schedule_area_name,s.resource_group,s.resource_code,s.default_rows,
           s.planner_owner,s.display_order,
           coalesce(string_agg(m.standard_operation,', ' order by m.standard_operation) filter(where m.standard_operation is not null),'—') operations
    from md_schedule_area s
    left join md_schedule_area_operation m on m.schedule_area_code=s.schedule_area_code and m.is_active=true
    where s.is_active=true group by s.id order by s.display_order,s.schedule_area_code`),
   db.query(`select o.standard_operation,o.sort_order,o.is_paint from md_operation_code_order o order by o.sort_order`),
   db.query(`
    select r.recipe_key,r.recipe_no,r.recipe_name,r.process_family,
     (select coalesce(nullif(m.operation_code,''),m.standard_operation) from md_main_operation_recipe m
      where m.recipe_key=r.recipe_key and m.is_active=true
      order by (m.is_default=false),m.priority,m.operation_code limit 1) default_operation
    from md_process_recipe r where r.is_active=true order by r.process_family,r.recipe_no`),
   db.query(`select m.operation_code,m.standard_operation,m.recipe_key,m.priority,m.is_default,m.selection_rule
    from md_main_operation_recipe m where m.is_active=true order by m.operation_code,m.priority,m.recipe_key`),
   db.query(`select r.recipe_key,r.calc_type,r.priority,r.fixed_hours,r.standard_hours,r.qty_min,r.qty_max
    from md_recipe_time_rule r where r.is_active=true order by r.recipe_key,r.priority`),
   db.query(`select r.phase,r.priority,r.qty_min,r.qty_max,r.surface_min_dm2,r.surface_max_dm2,r.duration_minutes
    from md_chemical_handling_time_rule r where r.is_active=true order by r.phase,r.priority,r.id`),

   db.query(`select r.resource_code,r.resource_name,r.resource_group,r.sort_order,r.max_concurrent
    from md_schedule_resource r where r.is_active=true order by r.sort_order,r.resource_code`)
  ]);
  mappings=mappingQ.rows;areas=areaQ.rows;scheduleAreas=scheduleQ.rows;operationOrders=orderQ.rows;
  recipes=recipeQ.rows;recipeMaps=recipeMapQ.rows;timeRules=timeQ.rows;
  handlingRules=handlingQ.rows;resources=resourceQ.rows;
 }catch(e){error=e instanceof Error?e.message:String(e)}
 finally{db.release()}

 const precleanRecipes=["001","009","016","025"];

 return <main className="erp-shell">
  <header className="erp-header">
   <div><h1>ST Planning</h1><p>Production Planning & Scheduling</p></div>
   <span className="erp-env">GUIDE</span>
  </header>
  <AppTabs active="guide"/>
  <section className="erp-content erp-content-full guide-page">
   <div className="erp-page-head guide-head">
    <div><h2>Logic & Hướng dẫn vận hành</h2><p>Tài liệu đầy đủ: luồng dữ liệu, logic điều độ, mapping, cách dùng từng màn hình — cập nhật theo code hiện tại.</p></div>
    <div className="guide-version"><b>v282</b><span>{new Date().toLocaleDateString("vi-VN")}</span></div>
   </div>

   <div className="guide-jump">
    <a href="#overview">Tổng quan</a>
    <a href="#dataflow">Luồng dữ liệu</a>
    <a href="#chemical">Chuỗi Chemical</a>
    <a href="#constraints">Ràng buộc</a>
    <a href="#continuation">Nối tiếp</a>
    <a href="#suggest">Đề xuất</a>
    <a href="#schedule-use">Trang Điều độ</a>
    <a href="#mapping">Mapping (sống)</a>
    <a href="#config">Cấu hình</a>
    <a href="#faq">FAQ</a>
   </div>

   {/* ============ TỔNG QUAN ============ */}
   <Section id="overview" title="1 · Tổng quan hệ thống"
    sub="ST Planning = Master Data → All Open Jobs → Planning Board → Batch → Chemical Line Scheduling → Job update (SCC)">
    <div className="lg-lead">
     Hệ thống lập kế hoạch sản xuất cho công đoạn <b>Surface Treatment (Hàng không)</b>. Dữ liệu job được import từ nguồn
     (SCC/Excel) vào <b>Open Jobs</b>, qua các bảng <b>Master Data</b> (Operation, Mapping, Recipe, Process Time...) hệ thống
     nhóm job thành <b>Batch</b>, rồi xếp <b>Flybar + thời gian</b> trên đường Chemical Line và các vùng khác.
    </div>
    <div className="lg-stats">
     <div className="lg-stat"><b>{resources.filter(r=>r.resource_group==="CHEMICAL_LINE").length}</b><span>Flybar Chemical (FB-01…06)</span></div>
     <div className="lg-stat"><b>{recipes.length}</b><span>Recipe đang hoạt động</span></div>
     <div className="lg-stat"><b>{recipeMaps.length}</b><span>Mapping Operation→Recipe</span></div>
     <div className="lg-stat"><b>{scheduleAreas.length}</b><span>Vùng điều độ</span></div>
     <div className="lg-stat"><b>{mappings.length}</b><span>Mapping Source→Main</span></div>
     <div className="lg-stat"><b>{precleanRecipes.length}</b><span>Recipe Pre-clean (có NDT)</span></div>
    </div>
    {error&&<div className="notice">Không đọc được một phần dữ liệu cấu hình: {error}</div>}
   </Section>

   {/* ============ LUỒNG DỮ LIỆU ============ */}
   <Section id="dataflow" title="2 · Luồng dữ liệu tổng thể" sub="Từ job nguồn → lịch sản xuất → cập nhật ngược về job">
    <Chain steps={[
     {t:"1 · Open Jobs",d:"Import từ nguồn (SCC/Excel)",c:"gray"},
     {t:"2 · Master Data",d:"Operation · Mapping · Recipe · Process Time",c:"teal"},
     {t:"3 · All Open Jobs",d:"Xem/duyệt 140+ cột dữ liệu gốc",c:"blue"},
     {t:"4 · Planning Board",d:"Chọn job → Tạo Batch (recipe theo rule)",c:"blue"},
     {t:"5 · Điều độ",d:"Xếp FB + giờ (Chemical/khác)",c:"green"},
     {t:"6 · Batch",d:"Fill/Jobs · SCC · cập nhật trạng thái",c:"orange"},
    ]}/>
    <div className="lg-note">
     <b>Ngày sản xuất:</b> bắt đầu lúc <b>06:00</b> và kết thúc <b>06:00 hôm sau</b> (múi giờ Asia/Ho_Chi_Minh) — mọi bảng
     điều độ, Timeline và xếp lịch đều theo chu kỳ này. {badge("06:00 → 06:00","warning")}
    </div>
   </Section>

   {/* ============ CHUỖI CHEMICAL ============ */}
   <Section id="chemical" title="3 · Chuỗi thời gian 1 lô trên Chemical Line"
    sub="Mỗi lô chiếm 1 Flybar liên tục từ Loading đến hết Unloading">
    <div className="lg-two-col">
     <div>
      <VertChain steps={[
       {t:"1 · Loading",d:"Treo chi tiết lên Flybar — thời gian theo cấu hình Loading (Qty/Surface)",c:"blue"},
       {t:"2 · Process",d:"Nhúng hóa chất — Process Start = Loading End",c:"green"},
       {t:"3 · NDT",d:"CHỈ với Recipe Pre-clean 001 / 009 / 016 / 025 — cố định 05:00, cách lần trước ≥ 01:30, tối đa 2 FB cùng lúc",c:"amber",note:"NDT Start = max(Process End, NDT trước + 1:30)"},
       {t:"4 · Unloading",d:"Lấy chi tiết ra — Unloading Start = NDT End (hoặc Process End nếu không NDT)",c:"purple"},
       {t:"5 · FB sẵn sàng",d:"Flybar được giải phóng sau Unloading End",c:"gray"},
      ]}/>
     </div>
     <div className="lg-formulas">
      <div className="lg-formula-card">
       <b>Thời gian các đoạn lấy từ đâu?</b>
       <ul>
        <li><b>Loading / Unloading</b> → <code>md_chemical_handling_time_rule</code> (theo khoảng Qty / Surface, ưu tiên thấp = chọn trước).</li>
        <li><b>Process</b> → <code>md_recipe_time_rule</code>: ưu tiên <b>FIXED_HOURS</b>, không có thì <b>QTY_SURFACE</b> (theo Qty/Surface).</li>
        <li><b>NDT</b> → cố định 300 phút, riêng hàng đợi NDT (khoá advisory để 2 request không trùng slot).</li>
        <li><b>Ngày/giờ nhập</b> = Loading Start; toàn chuỗi tính tự động theo công thức bên trái.</li>
       </ul>
      </div>
      <div className="lg-formula-card">
       <b>Thứ tự lô = thứ tự dòng trên bảng (từ trên xuống).</b>
       Lô sau không bao giờ được Loading trước khi lô trước Loading xong (chuỗi nối tiếp theo giờ).
      </div>
      <div className="lg-formula-card">
       <b>Dự báo trực tiếp (Preview):</b> điền Recipe + giờ + duration trên dòng → bảng hiện ngay các cột giờ màu
       Loading → Process → NDT → Unloading (đủ Start/End từng đoạn) để kiểm tra trước khi Save.
      </div>
     </div>
    </div>
   </Section>

   {/* ============ RÀNG BUỘC ============ */}
   <Section id="constraints" title="4 · Các ràng buộc điều độ (server chặn cứng)"
    sub="Dù nhập tay, Đề xuất hay Save — server luôn kiểm tra và báo rõ nếu vi phạm">
    <div className="lg-key">
     <Rule title="Chỉ 1 FB được Loading cùng lúc" tone="important">Cả 6 Flybar dùng chung trạm Loading → hai lịch Chemical không được trùng giờ Loading. Lỗi báo rõ lô nào đang chiếm.</Rule>
     <Rule title="Tối đa 3 Process cùng lúc">Chạy đồng thời không quá 3 Process trên toàn đường Chemical.</Rule>
     <Rule title="NDT: cách ≥ 1:30 và tối đa 2 FB cùng lúc" tone="important">NDT Pre-clean phải ≥ 1:30 sau lần NDT trước; đồng thời chỉ 2 FB được NDT — lô thứ 3 tự đẩy sang khi có FB NDT trống.</Rule>
     <Rule title="FB bận cả chuỗi">Từ Loading Start đến Unloading End, Flybar bị khoá — lịch khác không thể chèn vào giữa.</Rule>
     <Rule title="Không trùng lịch cùng Resource">Hai lịch trên cùng FB/FB đang bận → chặn, kèm tên lô đang chiếm.</Rule>
     <Rule title="Save phải có Operation hợp lệ">Operation của dòng phải thuộc vùng; tự suy từ Recipe (Operation Code ưu tiên) nếu chưa chọn.</Rule>
     <Rule title="Ngày sản xuất 06:00 → 06:00">Timeline mở rộng tối đa 48h nếu NDT/Unloading kéo qua 06:00 hôm sau.</Rule>
     <Rule title="Xung đột trên Timeline hiện đỏ ⚠">Hai lịch cùng Resource chồng giờ → đánh dấu đỏ + tooltip cảnh báo.</Rule>
    </div>
   </Section>

   {/* ============ NỐI TIẾP ============ */}
   <Section id="continuation" title="5 · Nối tiếp cùng FB — không Loading lại"
    sub="Lô sau chạy NGAY trên chính FB của lô trước khi lô trước vừa xong (Loading 0 phút)">
    <div className="lg-two-col">
     <div>
      <b className="lg-mini-title">Tự động (phát hiện job chung) — server tự kiểm chứng</b>
      <Chain steps={[
       {t:"Lô A (CPBILP)",d:"có job J1 · xong unloading 14:30 trên FB-01",c:"blue"},
       {t:"Lô B (BSAUNSLD)",d:"có job J1 ở công đoạn sau",c:"green"},
       {t:"Nối tiếp?",d:"J1 chung + A đã schedule + đúng FB + |giờ| ≤ 5 phút",c:"amber"},
      ]}/>
      <ul className="lg-list">
       <li>Server <b>tự truy vấn</b> bảng job (planning_batch_job) để xác nhận cùng job — không tin dữ liệu gửi lên.</li>
       <li>Không phát hiện được (lô 0 job / lô trước chưa điều độ / khác FB / khác giờ) → <b>không nối tiếp</b>, Loading bình thường.</li>
      </ul>
     </div>
     <div>
      <b className="lg-mini-title">Thủ công (bạn chỉ định) — ưu tiên cao hơn</b>
      <ul className="lg-list">
       <li><b>Kéo dòng sau thả lên dòng trước</b> → hệ thống tự tạo liên kết nối tiếp (dòng sau nối tiếp dòng trước); huy hiệu <b>↳X</b> hiện cạnh số dòng.</li>
       <li>Khi Đề xuất: dòng này dùng <b>đúng FB của dòng X</b> + bắt đầu ngay khi dòng X unloading xong, Loading 0 phút.</li>
       <li>Không cần job — do bạn chỉ định; xoá dòng giữa chừng → liên kết tự dồn/bỏ; bấm huy hiệu <b>↳X</b> để xoá liên kết.</li>
      </ul>
      <b className="lg-mini-title">Nhìn thấy liên kết ở đâu?</b>
      <ul className="lg-list">
       <li>Cột <b>Loading End</b> của dòng nối tiếp hiện dấu <b>↳</b> (Loading 0 phút) thay vì giờ.</li>
       <li>Production Timeline: mũi tên <b>↳</b> nối đúng điểm chuyển tiếp 2 lô trên cùng FB.</li>
      </ul>
     </div>
    </div>
   </Section>

   {/* ============ ĐỀ XUẤT ============ */}
   <Section id="suggest" title="6 · Nút Đề xuất & gợi ý từng dòng"
    sub="Chọn Recipe → bấm Đề xuất → tự điền FB + Loading Start + Duration">
    <div className="lg-two-col">
     <div>
      <b className="lg-mini-title">Thuật toán (theo thứ tự dòng từ trên xuống)</b>
      <ol className="lg-list lg-ol">
       <li>Chỉ xét dòng <b>có Recipe</b>; dòng "Set later" bỏ qua.</li>
       <li>Giờ bắt đầu mong muốn = <b>giờ dòng nhập</b> (hoặc 06:00 nếu trống).</li>
       <li>Nếu dòng có <b>liên kết kéo-thả</b> / Previous Main hợp lệ → ưu tiên FB đó, bắt đầu tại điểm kết thúc.</li>
       <li>Không thì chọn <b>FB trống sớm nhất</b> (trùng giờ → FB-01…06).</li>
       <li>Giờ = max(giờ mong muốn, chuỗi Loading trước, FB hết bận, điểm nối tiếp).</li>
       <li>Nếu Process chạm trần 3 lô / FB bận → <b>tự đẩy 15 phút</b>, tối đa 7 ngày.</li>
       <li>NDT được xếp theo hàng đợi (≥1:30, ≤2 FB).</li>
       <li>Điền vào dòng: <b>Operation</b> (tự map từ Recipe), FB, Date, Loading Start, Duration (nếu trống).</li>
      </ol>
     </div>
     <div>
      <b className="lg-mini-title">Bảng dự báo theo cột màu</b>
      <p className="lg-p">Mỗi dòng nhập hiện sẵn các cột giờ màu: <b>LOADING</b> (xanh dương) Start/End · <b>PROCESS TIME</b> (xanh lá) Start/End/Duration · <b>NDT</b> (vàng) Start/End · <b>UNLOADING</b> (tím) Start/End — tính tự động theo engine, nhìn là thấy cả chuỗi trước khi Save.</p>
      <b className="lg-mini-title">Sau khi đề xuất</b>
      <p className="lg-p">Xem từng dòng (các cột giờ màu) → chỉnh giờ override Process/NDT/Unloading nếu cần → <b>Save từng dòng</b>.
      Save 1 dòng KHÔNG mất các dòng khác; dòng vừa lưu nhảy lên phần lịch thật, Timeline cập nhật ngay.</p>
     </div>
    </div>
   </Section>

   {/* ============ TRANG ĐIỀU ĐỘ ============ */}
   <Section id="schedule-use" title="7 · Hướng dẫn trang Điều độ (Schedule)"
    sub="Các thao tác chính từng bước">
    <div className="lg-key lg-key-2">
     <Rule title="① Chọn ngày & Planner">Trên đầu trang chọn Ngày + Planner 1/2 → Load. Các vùng (Flybar#, Painting…) hiện theo phân công Planner.</Rule>
     <Rule title="② Nhập lô mới">Chọn Recipe (Operation tự điền) + FB + giờ → xem dự báo các cột giờ màu (Loading/Process/NDT/Unloading) → Save. Hoặc bấm <b>Đề xuất</b> để tự điền cả bảng.</Rule>
     <Rule title="③ Kéo-thả lô Unscheduled">Kéo thẻ lô trong "Unscheduled Batches" vào đúng dòng muốn — <b>chốt Operation</b>: sai op hoặc dòng đã có lô → bị chặn kèm báo rõ.</Rule>
     <Rule title="④ Chỉnh giờ override">Dòng đang nhập có hàng nhỏ Process / NDT / Unloading để tinh chỉnh giờ bắt đầu từng đoạn trước khi Save.</Rule>
     <Rule title="⑤ Quản lý lịch đã lưu">↑↓ đổi thứ tự · Edit sửa · Fill/Jobs xem job trong lô · Delete xoá (job quay lại Candidate/Eligible nếu chuỗi cho phép).</Rule>
     <Rule title="⑥ Đọc Timeline">Production Timeline: 06:00→06:00, 4 đoạn màu (Loading xanh nhạt · Process xanh lá · NDT vàng · Unloading tím), mũi tên ↳ = nối tiếp, ⚠ đỏ = xung đột, rê chuột xem chi tiết.</Rule>
    </div>
   </Section>

   {/* ============ MAPPING SỐNG ============ */}
   <Section id="mapping" title="8 · Bản đồ Mapping & cấu hình đang chạy (đọc trực tiếp từ hệ thống)"
    sub="Đây là dữ liệu THẬT bạn đang cấu hình — ai mở trang này đều thấy mapping hiện hành">
    <div className="lg-subtitle">8.1 · Recipe → Operation (mặc định) — dùng khi Đề xuất / Save tự xác định Operation</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Recipe No</th><th>Recipe Name</th><th>Process Family</th><th>Operation mặc định</th></tr></thead>
     <tbody>
      {recipes.map((r:any,i)=><tr key={i}>
       <td className="mono"><b>{r.recipe_no||"—"}</b></td>
       <td>{r.recipe_name||"—"}</td>
       <td>{r.process_family||"—"}</td>
       <td>{r.default_operation?badge(String(r.default_operation),"green"):badge("Chưa map","warning")}</td>
      </tr>)}
      {!recipes.length&&<tr><td colSpan={4} className="muted">Chưa có recipe.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.2 · Operation Code → Recipe Mapping (md_main_operation_recipe)</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Operation Code</th><th>Standard Op</th><th>Recipe</th><th>Priority</th><th>Default</th><th>Selection Rule</th></tr></thead>
     <tbody>
      {recipeMaps.map((m:any,i)=><tr key={i}>
       <td><b>{m.operation_code}</b></td>
       <td>{m.standard_operation||"—"}</td>
       <td className="mono">{m.recipe_key}</td>
       <td className="num">{m.priority??100}</td>
       <td>{m.is_default?badge("YES","green"):"—"}</td>
       <td>{m.selection_rule||"—"}</td>
      </tr>)}
      {!recipeMaps.length&&<tr><td colSpan={6} className="muted">Chưa có mapping. Vào Cấu hình → Process Recipe → Operation Code → Recipe Mapping.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.3 · Source → Main Operation Mapping (md_st_operation_mapping)</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>ST Group</th><th>Source Op</th><th>Rule Standard Op</th><th>Mapping Rule</th></tr></thead>
     <tbody>
      {mappings.map((m:any,i)=><tr key={i}>
       <td>{m.st_group}</td><td className="mono">{m.source_operation_code}</td>
       <td>{m.standard_operation_rule||"—"}</td><td>{m.mapping_rule||"—"}</td>
      </tr>)}
      {!mappings.length&&<tr><td colSpan={4} className="muted">Chưa có mapping.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.4 · Vùng điều độ (Schedule Area) + Operation thuộc vùng</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Vùng</th><th>Resource Group</th><th>Resource</th><th>Số dòng</th><th>Planner</th><th>Operation</th></tr></thead>
     <tbody>
      {scheduleAreas.map((s:any,i)=><tr key={i}>
       <td><b>{s.schedule_area_name}</b><small className="planning-sub"> {s.schedule_area_code}</small></td>
       <td>{s.resource_group||"—"}</td><td>{s.resource_code||"—"}</td>
       <td className="num">{s.default_rows}</td><td>{s.planner_owner||"—"}</td>
       <td>{String(s.operations||"").split(", ").map((o:string)=><span key={o}>{badge(o,"blue")} </span>)}</td>
      </tr>)}
      {!scheduleAreas.length&&<tr><td colSpan={6} className="muted">Chưa có vùng điều độ.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.5 · Resource (Flybar / Thiết bị)</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Resource</th><th>Nhóm</th><th>Thứ tự</th><th>Process song song tối đa</th></tr></thead>
     <tbody>
      {resources.map((r:any,i)=><tr key={i}>
       <td><b>{r.resource_code}</b><small className="planning-sub"> {r.resource_name||""}</small></td>
       <td>{r.resource_group||"—"}</td><td className="num">{r.sort_order}</td><td className="num">{r.max_concurrent||3}</td>
      </tr>)}
      {!resources.length&&<tr><td colSpan={4} className="muted">Chưa có resource.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.6 · Process Time theo Recipe (md_recipe_time_rule) — ưu tiên FIXED_HOURS</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Recipe</th><th>Kiểu</th><th>Priority</th><th>Fixed (giờ)</th><th>Standard (giờ)</th><th>Qty min–max</th></tr></thead>
     <tbody>
      {timeRules.map((r:any,i)=><tr key={i}>
       <td className="mono">{r.recipe_key}</td>
       <td>{r.calc_type==="FIXED_HOURS"?badge("FIXED_HOURS","green"):badge("QTY_SURFACE","blue")}</td>
       <td className="num">{r.priority}</td>
       <td className="mono">{r.fixed_hours??"—"}</td>
       <td className="mono">{r.standard_hours??"—"}</td>
       <td className="mono">{r.qty_min??"—"} – {r.qty_max??"—"}</td>
      </tr>)}
      {!timeRules.length&&<tr><td colSpan={6} className="muted">Chưa có Process Time. Vào Cấu hình → Process Recipe → Process Time.</td></tr>}
     </tbody>
    </table></div>

    <div className="lg-subtitle">8.7 · Loading / Unloading Time (md_chemical_handling_time_rule)</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Pha</th><th>Priority</th><th>Qty</th><th>Surface dm²</th><th>Phút</th></tr></thead>
     <tbody>
      {handlingRules.map((r:any,i)=><tr key={i}>
       <td>{r.phase==="LOADING"?badge("LOADING","blue"):badge("UNLOADING","purple")}</td>
       <td className="num">{r.priority}</td>
       <td className="mono">{r.qty_min??"—"} – {r.qty_max??"—"}</td>
       <td className="mono">{r.surface_min_dm2??"—"} – {r.surface_max_dm2??"—"}</td>
       <td className="num"><b>{r.duration_minutes}</b></td>
      </tr>)}
      {!handlingRules.length&&<tr><td colSpan={5} className="muted">Chưa có cấu hình Loading/Unloading Time.</td></tr>}
     </tbody>
    </table></div>


    <div className="lg-subtitle">8.9 · Physical Area / ST Group</div>
    <div className="table-wrap"><table className="erp-table">
     <thead><tr><th>Area</th><th>ST Groups</th></tr></thead>
     <tbody>
      {areas.map((a:any,i)=><tr key={i}>
       <td><b>{a.area_name}</b><small className="planning-sub"> {a.area_code}</small></td>
       <td>{a.st_groups}</td>
      </tr>)}
      {!areas.length&&<tr><td colSpan={2} className="muted">Chưa có area.</td></tr>}
     </tbody>
    </table></div>
   </Section>

   {/* ============ CẤU HÌNH ============ */}
   <Section id="config" title="9 · Hướng dẫn cấu hình từng trang (thứ tự nên làm)"
    sub="Cấu hình đúng 1 lần, các bảng điều độ tự chạy">
    <ol className="lg-steps">
     <li><b>Main Operation Master</b> — khai báo các Operation chính (BSASLD, CPBILP…) + ST Group + Batch Prefix 3 ký tự.</li>
     <li><b>ST Operation Flow</b> — chỉ cấu hình <b>Planning Operation</b> (Source → Main) hoặc <b>ST_SCOPE_ONLY</b>. <b>Intermediate được suy ra tự động</b> từ các operation nằm giữa hai Main Planning liên tiếp trong ST Routing Chain · Standardized.</li>
     <li><b>ST Scope & Operation Order</b> — phạm vi + thứ tự operation dùng cho điều độ.</li>
     <li><b>Source → Main Mapping</b> — map Operation từ dữ liệu nguồn sang Operation chuẩn.</li>
     <li><b>ST Group Master + Physical Area Master</b> — nhóm + khu vực vật lý (gắn batch).</li>
     <li><b>Schedule Area Mapping</b> — khai vùng điều độ (Flybar#, Painting…) + Operation thuộc vùng + số dòng mặc định.</li>
     <li><b>Phân chia Planner</b> — gán vùng → Planner 1/2.</li>
     <li><b>Process Recipe</b> — 3 mục trong trang này:
      <ul><li>Khai Recipe (recipe_no, name, family).</li>
      <li><b>Operation Code → Recipe Mapping</b>: map Recipe → Operation (hệ thống tự điền Operation khi chọn Recipe / Đề xuất / Save).</li>
      <li><b>Process Time</b>: FIXED_HOURS (hoặc QTY_SURFACE) cho từng Recipe — thiếu là không đề xuất/save được.</li>
      <li><b>Loading/Unloading Time</b> (Chemical Handling): phút Loading/Unloading theo Qty/Surface.</li></ul></li>
     <li><b>Open Job Column Values</b> — cấu hình cột dữ liệu gốc hiển thị ở All Open Jobs (quét tự động 140+ cột).</li>
     <li><b>Batch Key / Recipe Rules</b> — rule đề xuất Recipe + Batch Key + Prefix khi tạo lô từ Planning Board.</li>
    </ol>
   </Section>

   {/* ============ FAQ ============ */}
   <Section id="faq" title="10 · Câu hỏi thường gặp & cách xử lý lỗi">
    <Faq q='"Flybar#: dòng X chưa xác định được Operation — Recipe chưa map"' a={<>Chọn Operation trong ô xổ xuống cạnh Recipe (viền cam), hoặc vào <b>Cấu hình → Process Recipe → Operation Code → Recipe Mapping</b> map Recipe đó với Operation đúng.</>}/>
    <Faq q='"Chỉ 1 Flybar được Loading cùng lúc…"' a={<>Lịch mới trùng giờ Loading với lịch khác. Đổi giờ Loading hoặc dùng <b>Đề xuất</b> để hệ thống tự xếp chuỗi không trùng.</>}/>
    <Faq q='"NDT Start phải cách NDT trước ít nhất 01:30"' a={<>Lô Pre-clean phải cách lần NDT trước ≥ 1:30 và tối đa 2 FB NDT cùng lúc. Dùng Đề xuất để tự xếp đúng hàng đợi NDT.</>}/>
    <Faq q='"Recipe chưa cấu hình Process Time"' a={<>Vào Cấu hình → Process Recipe → Process Time, thêm FIXED_HOURS (giờ) cho recipe đó. Thiếu → không đề xuất / save được.</>}/>
    <Faq q='"Lưu 1 dòng có làm mất các dòng khác không?"' a={<>Không. Mỗi Save chỉ xử lý đúng dòng đó; các dòng đang nhập dở giữ nguyên, Timeline cập nhật ngay không cần F5.</>}/>
    <Faq q='"Vì sao Loading Start = Process Start?"' a={<>Đó là lô <b>nối tiếp</b> (Loading 0 phút) — hoặc dữ liệu cũ lưu sai trước bản v210. Sửa: Edit → Save Edit lại dòng đó.</>}/>
    <Faq q='"Job có NextOperation trung gian nhưng không có trong AllOperation thì làm sao?"' a={<>Không cần cấu hình Intermediate bằng tay. Hệ thống tự lấy <b>routing_code + seq + operation_code</b> trong <b>ST Routing Chain · Standardized</b>, suy ra operation nằm giữa hai Main Planning và resolve đúng Next Main trong canonical Planning Chain. Nếu routing/Main thay đổi, bấm <b>Rebuild Auto Bridge Segments</b>.</>}/>
    <Faq q='"NextOperation là Main Planning nhưng resolver vẫn NO CHAIN thì sao?"' a={<>Fallback cuối v313: nếu <b>NextOperation</b> khớp một Main Planning occurrence hợp lệ thì chính Main đó là <b>Current Main</b>. Các <b>Next Main</b> sau đó lấy theo đúng thứ tự Main trong <b>AllOperation</b> của Job. Nếu cùng NextOperation lặp nhiều occurrence mà LastLaborOp vẫn không xác định được vị trí duy nhất thì hệ thống giữ <b>NO CHAIN</b>, không đoán.</>}/>
    <Faq q='"Kéo lô vào dòng không được?"' a={<>Kéo-thả dùng trên máy tính. Kiểm tra: dòng phải trống + Operation của lô phải thuộc vùng. Máy cảm ứng thì bấm vào thẻ lô để vào dòng trống đầu tiên.</>}/>
    <Faq q='"Tôi muốn lô BSAUNSLD chạy ngay sau CPBILP trên cùng FB, không loading"' a={<>Tự động: 2 lô cùng job + lô trước đã điều độ đúng FB → hệ thống tự nối tiếp. Hoặc thủ công: <b>kéo dòng sau thả lên dòng trước</b> để tạo liên kết, rồi Đề xuất.</>}/>
    <Faq q='"Schedule Table xếp thế nào?"' a={<>Xếp theo đúng thứ tự lô như bảng điều độ: thứ tự thao tác (↑↓) trước, rồi theo giờ Loading Start, trùng giờ thì theo FB rồi Batch.</>}/>
    <Faq q='"Thay đổi mã không cần SQL đúng không?"' a={<>Các bản v195–v259 chỉ sửa code — deploy lên Vercel là xong, không cần chạy migration mới.</>}/>
   </Section>

  </section>
 </main>;
}
