import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";

export const dynamic="force-dynamic";

const badge=(text:string,kind="blue")=>
 <span className={`guide-badge guide-badge-${kind}`}>{text}</span>;

function FlowStep({n,title,sub}:{n:string;title:string;sub:string}){
 return <div className="guide-flow-step">
  <span className="guide-flow-no">{n}</span>
  <div><b>{title}</b><small>{sub}</small></div>
 </div>;
}

function Rule({
 title,children,tone="normal"
}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){
 return <div className={`guide-rule guide-rule-${tone}`}>
  <b>{title}</b>
  <div>{children}</div>
 </div>;
}

export default async function Page(){
 const db=await getPool().connect();

 let mappings:any[]=[];
 let areas:any[]=[];
 let scheduleAreas:any[]=[];
 let operationOrders:any[]=[];
 let recipes:any[]=[];
 let autoRules:any[]=[];
 let error="";

 try{
  const [mappingQ,areaQ,scheduleQ,orderQ,recipeQ,autoQ]=await Promise.all([
   db.query(`
    select
     m.sort_order,
     m.source_operation_code,
     m.st_group,
    m.standard_operation_rule,
     m.mapping_rule
    from md_st_operation_mapping m
    join md_st_operation_scope scope
      on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
     and scope.is_active=true
     and scope.operation_type='PLANNING_OPERATION'
    where m.is_active=true
    order by m.st_group,m.sort_order,m.source_operation_code
   `),
   db.query(`
    select
     a.id,a.area_code,a.area_name,a.sort_order,
     coalesce(
      string_agg(g.st_group,', ' order by g.st_group)
       filter(where g.st_group is not null),
      '—'
     ) st_groups
    from md_area a
    left join md_area_operation_group g
      on g.area_id=a.id and g.is_active=true
    where a.is_active=true
    group by a.id,a.area_code,a.area_name,a.sort_order
    order by a.sort_order,a.area_name
   `),
   db.query(`
    select
     a.display_order,
     a.schedule_area_code,
     a.schedule_area_name,
     a.resource_group,
     a.resource_code,
     a.default_rows,
     a.allow_manual_plan,
     a.allow_auto_plan,
     coalesce(
      string_agg(o.standard_operation,', ' order by o.standard_operation)
       filter(where o.standard_operation is not null),
      '—'
     ) standard_operations
    from md_schedule_area a
    left join md_schedule_area_operation o
      on o.schedule_area_code=a.schedule_area_code and o.is_active=true
    where a.is_active=true
    group by
     a.display_order,a.schedule_area_code,a.schedule_area_name,
     a.resource_group,a.resource_code,a.default_rows,
     a.allow_manual_plan,a.allow_auto_plan
    order by a.display_order,a.schedule_area_code
   `),
   db.query(`
    select o.operation_code,o.planning_sort_order
    from md_operation o
    join md_st_operation_scope s
      on upper(trim(s.operation_code))=upper(trim(o.operation_code)) and s.is_active=true
    where o.is_active=true and o.planning_sort_order is not null
    order by o.planning_sort_order,o.operation_code
   `),
   db.query(`
    select process_family,recipe_group,count(*)::int recipes
    from md_process_recipe
    where is_active=true
    group by process_family,recipe_group
    order by process_family,recipe_group
   `),
   db.query(`
    select standard_operation,is_active
    from md_auto_planning_rule
    where is_active=true
    order by standard_operation
   `)
  ]);

  mappings=mappingQ.rows;
  areas=areaQ.rows;
  scheduleAreas=scheduleQ.rows;
  operationOrders=orderQ.rows;
  recipes=recipeQ.rows;
  autoRules=autoQ.rows;
 }catch(e){
  error=e instanceof Error?e.message:String(e);
 }finally{
  db.release();
 }

 const mappingGroups=[...new Set(mappings.map(x=>String(x.st_group||"")))].filter(Boolean);

 return <main className="erp-shell">
  <header className="erp-header">
   <div>
    <h1>ST Planning</h1>
    <p>Surface Treatment Planning System</p>
   </div>
   <div className="erp-env">LOGIC & GUIDE · 26/08/2026</div>
  </header>

  <AppTabs active="guide"/>

  <section className="erp-content erp-content-full guide-page">
   <div className="erp-page-head guide-head">
    <div>
     <h2>Logic & Hướng dẫn vận hành</h2>
     <p>
      Tài liệu tra nhanh của ST Planning. Mapping/Area/Schedule Area bên dưới đọc trực tiếp
      từ cấu hình database hiện tại; phần logic mô tả kiến trúc đang sử dụng.
     </p>
    </div>
    <div className="guide-version">
     <b>Logic hiện tại</b>
     <span>v179 Operation Type</span>
    </div>
   </div>

   {error&&<div className="notice">
    <b>Không tải được một phần cấu hình live:</b> {error}
   </div>}

   <nav className="guide-jump">
    <a href="#flow">Luồng tổng</a>
    <a href="#operation">Operation / Mapping</a>
    <a href="#route">DONE · READY · WAITING</a>
    <a href="#candidate">Candidate & Batch</a>
    <a href="#schedule">Điều độ</a>
    <a href="#recipe">Recipe</a>
    <a href="#sort">Sort / Priority</a>
    <a href="#config">Cấu hình live</a>
    <a href="#quick">Hướng dẫn nhanh</a>
   </nav>

   <section id="flow" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>1. Luồng dữ liệu & vận hành tổng</b>
     <span>End-to-end</span>
    </div>

    <div className="guide-flow">
     <FlowStep n="1" title="Import Master" sub="Part / Revision / Routing / Finish / Recipe No."/>
     <span className="guide-arrow">→</span>
     <FlowStep n="2" title="Master Data" sub="Routing Detail + ST Routing + Recipe Master"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="3" title="ST Operation Scope" sub="PLANNING_OPERATION hoặc ST_SCOPE_ONLY"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="4" title="Source → Main" sub="Operation Code → Main Operation → ST Group"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="6" title="Area / Schedule" sub="ST Group → Physical Area; Main → Schedule Area"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="5" title="Planning Board" sub="Candidate → chọn Job/Main → Batch"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="6" title="Board Điều Độ" sub="Batch → Schedule Area / Resource / thời gian"/>
     <span className="guide-arrow">→</span>
     <FlowStep n="7" title="Handover" sub="Schedule previous → mở Main kế tiếp"/>
    </div>

    <div className="guide-key">
     <Rule title="Nguồn routing chuẩn" tone="important">
      <b>md_routing_detailed</b> theo Part + Revision là nguồn full routing và source_seq.
      All Open Job <b>AllOperation</b> chỉ còn fallback khi thiếu Routing Detail.
     </Rule>
     <Rule title="PIONBL">
      Có thể tồn tại trong routing để biết vị trí thực tế, nhưng <b>skip khỏi Planning Main chain</b>.
     </Rule>
     <Rule title="ST_SCOPE_ONLY">
      Vẫn thuộc ST Scope và xuất hiện trong All Open Jobs theo NextOperation, nhưng không map Main Operation và không tham gia Planning Chain, Batch hoặc Board Điều Độ.
     </Rule>
     <Rule title="Không trộn 3 loại thứ tự">
      <b>source_seq</b> = thứ tự trong routing từng Job ·
      <b>planning_sort_order</b> = thứ tự sản xuất của RAW NextOperation trong Operation Code Order ·
      <b>display_order</b> = thứ tự Schedule Area trên Board Điều Độ.
     </Rule>
    </div>
   </section>

   <section id="operation" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>2. Kiến trúc Operation / Mapping</b>
     <span>{mappings.length} mapping live · {mappingGroups.length} ST Groups</span>
    </div>

    <div className="guide-architecture">
     <div>{badge("Operation Code","gray")}<small>Ví dụ PPRSLVT, CPBILP, V_M-SPFD</small></div>
     <span>→</span>
     <div>{badge("ST Group","blue")}<small>PRIMER, MANUALSP, CHEMMILL...</small></div>
     <span>→</span>
     <div>{badge("Standard Operation","green")}<small>PRIMER / PRIMER2 / PRIMER3...</small></div>
     <span>→</span>
     <div>{badge("Area","amber")}<small>Chemical line, Painting, Plating...</small></div>
     <span>→</span>
     <div>{badge("Schedule Area / Resource","purple")}<small>Flybar#, CAB1, Manual DBL...</small></div>
    </div>

    <div className="guide-two-col">
     <div>
      <h3>Mapping đặc biệt phải nhớ</h3>
      <div className="guide-rule-list">
       <Rule title="MANUALSP">
        <code>V_M-SPFD</code>, <code>ARL-SHPN</code>, <code>V_M-SHPN</code> → MANUALSP.
       </Rule>
       <Rule title="RWK">
        <code>RWKCC-IM</code>, <code>RWK-BSA</code> → RWK.
       </Rule>
       <Rule title="V_PASS/BRTG">
        <code>CP-PA</code>, <code>V_PASS</code>, <code>BRTG</code> → V_PASS/BRTG.
       </Rule>
       <Rule title="Primer occurrence">
        FULTKAPP / PPRSLV2C / PPRSLVT / SIPT / V-SBPCMP:
        lần 1 → PRIMER, lần 2 → PRIMER2, lần 3+ → PRIMER3.
       </Rule>
       <Rule title="Topcoat occurrence">
        PTCSLVT / PTCWTR / SIPOC / V-ASCCMP / SIPPOC:
        lần 1 → TOPCOAT1, lần 2+ → TOPCOAT2.
       </Rule>
       <Rule title="HE-BAKE theo sequence">
        Sau plating → <b>HE-BAKE after plating</b>;
        trước A-DBLST/M-DBLST → <b>HE-BAKE before blasting</b>;
        còn lại → <b>HE-BAKE</b>.
       </Rule>
      </div>
     </div>

     <div>
      <h3>Nguyên tắc thay đổi cấu hình</h3>
      <div className="guide-rule-list">
       <Rule title="Chọn Operation Type">
        <b>ST_SCOPE_ONLY</b> chỉ cần Operation Code + ST Scope ON; Planning Order có thể để trống.
        <b> Planning Operation</b> bắt buộc đủ Main → Group → Physical Area → Schedule Area → Planner.
       </Rule>
       <Rule title="Thêm Operation Code">
        Thêm/đảm bảo Operation Code ở Source Operation → map trong ST Operation Mapping.
       </Rule>
       <Rule title="Thêm ST Group">
        ST Group Master → Area Master gán Group vào Area → Schedule Area Mapping gán Standard Operation vào lane.
       </Rule>
       <Rule title="Không hard-code Area">
        Planning Board lọc Operation theo Area từ mapping database hiện tại.
       </Rule>
       <Rule title="Operation Code Order">
        Main Operation chỉ xác định phạm vi Operation Code/Job thuộc Main.
        Thứ tự Candidate luôn lấy từ <b>Operation Code Order</b> của chính NextOperation.
        Operation Code mới thêm vào Main nhưng chưa có Order sẽ nằm cuối để planner gán thứ tự.
       </Rule>
      </div>
     </div>
    </div>
   </section>

   <section id="route" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>3. Route Matrix · DONE / READY / WAITING</b>
     <span>Logic quan trọng nhất</span>
    </div>

    <div className="guide-route-example">
     <div className="guide-state done"><b>CPBILP</b><span>DONE</span></div>
     <span>→</span>
     <div className="guide-state done"><b>BSAUNSLD</b><span>DONE</span></div>
     <span>→</span>
     <div className="guide-state ready"><b>M-DBLST</b><span>READY</span></div>
     <span>→</span>
     <div className="guide-state waiting"><b>HE-BAKE</b><span>WAITING</span></div>
     <span>→</span>
     <div className="guide-state waiting"><b>PRIMER</b><span>WAITING</span></div>
    </div>

    <div className="guide-formula">
     <div><code>source_seq &lt; ready_source_seq</code><b>DONE</b></div>
     <div><code>source_seq = ready_source_seq</code><b>READY / trạng thái Batch thực tế</b></div>
     <div><code>source_seq &gt; ready_source_seq</code><b>WAITING / plan-ahead thực tế</b></div>
    </div>

    <div className="guide-key">
     <Rule title="READY lấy từ đâu?" tone="important">
      Dùng Main hiện tại trong <b>full Routing Detail</b>. Nếu NextOperation là operation trung gian,
      hệ thống tiến tới Main Planning gần nhất phía sau.
     </Rule>
     <Rule title="Trước READY">
      Bất kỳ Main Operation có source_seq nhỏ hơn current đều được xem là <b>DONE</b>,
      trừ khi UI cần hiển thị trạng thái lịch sử thực tế đặc biệt.
     </Rule>
     <Rule title="Sau READY">
      Mặc định <b>WAITING</b>. Nếu đã được plan-ahead thật sự thì hiển thị
      READY / PLANNED-UNSCHEDULED / SCHEDULED / RUNNING / HOLD / COMPLETED tương ứng.
     </Rule>
     <Rule title="Không dùng planning_sort_order">
      DONE/READY/WAITING tuyệt đối không suy từ vị trí cột hay Operation Code Order.
      Chỉ dựa routing của từng Job.
     </Rule>
    </div>
   </section>

   <section id="candidate" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>4. Candidate Jobs & Batch Builder</b>
     <span>Manual Planning</span>
    </div>

    <div className="guide-two-col">
     <div>
      <h3>Chọn Job</h3>
      <div className="guide-rule-list">
       <Rule title="Cách chọn chính">
        Click trực tiếp ô <b>READY</b> trong Route Matrix để chọn đúng
        <b>Job + Main Operation</b>. Click lại để bỏ chọn.
       </Rule>
       <Rule title="WAITING">
        Click WAITING chỉ để kiểm tra/cảnh báo; không được thêm Batch nếu previous chưa đủ điều kiện.
       </Rule>
       <Rule title="Checkbox">
        Vẫn giữ để chọn Candidate current, nhưng cell READY là cách rõ nhất khi dùng All Areas.
       </Rule>
       <Rule title="Một Batch">
        Chỉ chứa Job của <b>cùng Standard Operation</b>. Paint còn phải cùng loại/recipe theo rule.
       </Rule>
      </div>
     </div>

     <div>
      <h3>Batch Builder</h3>
      <div className="guide-rule-list">
       <Rule title="Create New Batch">
        Không chọn Target Batch → tạo lô mới.
       </Rule>
       <Rule title="Add to Existing Batch">
        Chọn Target Batch cùng Main Operation → thêm Job nhanh vào lô có sẵn.
       </Rule>
       <Rule title="Batch đã Schedule">
        Có thể chọn theo rule hiện tại; hệ thống cập nhật Jobs / Qty / Surface / Process Time
        nhưng <b>không tự dịch slot Schedule đã có</b>.
       </Rule>
       <Rule title="Duplicate">
        Một Planning Operation không được nằm đồng thời trong Batch active khác.
       </Rule>
      </div>
     </div>
    </div>

    <div className="guide-key">
     <Rule title="Batch chưa Schedule" tone="important">
      Tạo Batch chỉ làm Main hiện tại thành <b>PLANNED</b>. Không tự mở Main kế tiếp.
     </Rule>
     <Rule title="Schedule Gate" tone="important">
      Main kế tiếp chỉ được mở <b>ELIGIBLE / READY</b> khi immediate previous Main
      có <b>planning_schedule</b> active. Đây là rule dùng chung để sau này Auto Schedule tái sử dụng.
     </Rule>
    </div>
   </section>

   <section id="schedule" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>5. Board Điều Độ</b>
     <span>{scheduleAreas.length} Schedule Areas live</span>
    </div>

    <div className="guide-rule-list guide-grid-rules">
     <Rule title="Unscheduled Batches">
      Batch trên Planning Board chưa điều độ sẽ hiện ngay phía trên khu vực Schedule tương ứng,
      dựa vào <b>Schedule Area Mapping</b>.
     </Rule>
     <Rule title="Resource">
      Resource/Flybar/Cabin lấy từ Schedule Area + Resource hiện tại, không hard-code theo Candidate.
     </Rule>
     <Rule title="Edit / Move / Delete">
      Batch đã schedule có thể chỉnh sửa, lên/xuống thứ tự hoặc xóa theo chức năng Board Điều Độ hiện tại.
     </Rule>
     <Rule title="Thông tin Previous Main">
      Card unscheduled hiển thị Previous Main Batch, trạng thái Schedule và completion time khi có.
     </Rule>
     <Rule title="Cabin / lane độc lập">
      Danh sách unscheduled có thể nhìn giống nhau ở nhiều lane tương thích,
      nhưng khi schedule phải kiểm tra resource/time để tránh overlap.
     </Rule>
     <Rule title="Manual / Auto">
      Manual đang là luồng thao tác chính. Cấu trúc Schedule Area và rule được giữ để Auto mở rộng sau.
     </Rule>
    </div>
   </section>

   <section id="recipe" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>6. Recipe / Process Time</b>
     <span>{recipes.reduce((a,x)=>a+Number(x.recipes||0),0)} recipes live</span>
    </div>

    <div className="guide-two-col">
     <div>
      <h3>Recipe source of truth</h3>
      <div className="guide-rule-list">
       <Rule title="Recipe Name">
        Luôn lấy từ <b>Process Recipe Master / md_process_recipe</b>, không lấy tên từ Master List.
       </Rule>
       <Rule title="Paint">
        Part Master cung cấp Recipe No.; hệ thống resolve sang Process Recipe Master để lấy Recipe Name.
       </Rule>
       <Rule title="Chemical">
        Theo Operation Code; một Operation Code có thể có nhiều Recipe.
       </Rule>
       <Rule title="Padding">
        Recipe số được chuẩn hóa 3 chữ số: 1 → 001, 12 → 012.
       </Rule>
      </div>

      <h3>Batch Key / Recipe Rules (v188)</h3>
      <div className="guide-rule-list">
       <Rule title="Nguồn dữ liệu">
        All Open Job là nguồn gốc. <b>Open Job Column Values</b> tổng hợp giá trị từng cột; <b>Batch Key / Recipe Rules</b> dùng các giá trị đó để đề xuất Recipe + Batch Key + Prefix.
       </Rule>
       <Rule title="Batch Key ≠ Prefix">
        Batch Key là khóa gom lô (vd PAINT|PRIMER|20-T3-10 EPOXY PRIMER); Prefix là 3 ký tự sinh số lô (vd PRI_27AUG_001). Template Batch Key có thể chứa {'{COT}'} để lấy giá trị thật của Job.
       </Rule>
       <Rule title="Áp dụng mọi công đoạn">
        Mọi Main Operation đều dùng chung cơ chế rule; không hard-code Chemical/Paint. Nếu chưa có rule khớp, planner chọn Recipe tay; nhiều rule cùng ưu tiên khớp → hệ thống báo để planner chọn, không tự chọn bừa.
       </Rule>
       <Rule title="Process Time mọi công đoạn">
        Process Time Rule không còn giới hạn Chemical (FIXED_HOURS) / Paint (QTY_SURFACE): mọi công đoạn đều có thể dùng cả hai kiểu.
       </Rule>
      </div>
     </div>

     <div>
      <h3>Process Time</h3>
      <div className="guide-rule-list">
       <Rule title="FIXED_HOURS">
        Công đoạn cố định giờ dùng Fixed Hours.
       </Rule>
       <Rule title="QTY_SURFACE">
        Paint có thể tính theo vùng Qty + Surface dm²; planner có thể override khi điều độ.
       </Rule>
       <Rule title="Existing scheduled Batch">
        Khi thêm Job vào Batch đã Schedule, process estimate được tính lại nhưng slot thời gian hiện tại không tự đổi.
       </Rule>
      </div>
     </div>
    </div>
   </section>

   <section id="sort" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>7. Sort / Priority / View</b>
     <span>{operationOrders.length} Operation Codes đã gán Planning Order</span>
    </div>

    <div className="guide-formula guide-sort-formula">
     <div><code>1</code><b>NextOperation · Operation Code Order</b></div>
     <div><code>2</code><b>Priority trong cùng Operation</b></div>
     <div><code>3</code><b>Job No. để ổn định thứ tự</b></div>
    </div>

    <div className="guide-key">
     <Rule title="Priority highlight">
      CAT3 / CAT5 / Sale / tháng ưu tiên được highlight để planner nhìn nhanh.
      Priority không được làm NextOperation nhảy loạn nếu NextOperation Order là sort chính.
     </Rule>
     <Rule title="Route Focus">
      Dùng khi bảng quá nhiều cột; Full View dùng khi cần xem toàn bộ route.
     </Rule>
     <Rule title="Column presets">
      Set / Load / Delete Default chỉ là cấu hình hiển thị, không thay đổi Planning logic.
     </Rule>
    </div>
   </section>

   <section id="config" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>8. Cấu hình live hiện tại</b>
     <span>Đọc trực tiếp database</span>
    </div>

    <details open className="guide-details">
     <summary>Operation Code → ST Group → Standard Operation ({mappings.length})</summary>
     <div className="table-wrap guide-live-table">
      <table className="erp-table">
       <thead>
        <tr>
         <th>#</th><th>Operation Code</th><th>ST Group</th>
         <th>Standard Operation Rule</th><th>Mapping Rule</th>
        </tr>
       </thead>
       <tbody>
        {mappings.map((x:any)=><tr key={`${x.sort_order}-${x.source_operation_code}-${x.standard_operation_rule}`}>
         <td className="num">{x.sort_order}</td>
         <td><b>{x.source_operation_code}</b></td>
         <td>{x.st_group}</td>
         <td>{x.standard_operation_rule}</td>
         <td>{badge(String(x.mapping_rule||"—"),x.mapping_rule==="DIRECT"?"gray":"amber")}</td>
        </tr>)}
       </tbody>
      </table>
     </div>
    </details>

    <details className="guide-details">
     <summary>Area → ST Groups ({areas.length})</summary>
     <div className="table-wrap guide-live-table">
      <table className="erp-table">
       <thead><tr><th>Order</th><th>Area</th><th>Code</th><th>ST Groups</th></tr></thead>
       <tbody>{areas.map((x:any)=><tr key={x.id}>
        <td className="num">{x.sort_order}</td>
        <td><b>{x.area_name}</b></td>
        <td>{x.area_code}</td>
        <td>{x.st_groups}</td>
       </tr>)}</tbody>
      </table>
     </div>
    </details>

    <details className="guide-details">
     <summary>Schedule Area → Standard Operations ({scheduleAreas.length})</summary>
     <div className="table-wrap guide-live-table">
      <table className="erp-table">
       <thead>
        <tr>
         <th>Order</th><th>Schedule Area</th><th>Resource</th>
         <th>Rows</th><th>Manual</th><th>Auto</th><th>Mapped Standard Operations</th>
        </tr>
       </thead>
       <tbody>{scheduleAreas.map((x:any)=><tr key={x.schedule_area_code}>
        <td className="num">{x.display_order}</td>
        <td><b>{x.schedule_area_name}</b><small className="planning-sub">{x.schedule_area_code}</small></td>
        <td>{x.resource_code||x.resource_group||"—"}</td>
        <td className="num">{x.default_rows}</td>
        <td>{x.allow_manual_plan?"Yes":"No"}</td>
        <td>{x.allow_auto_plan?"Yes":"No"}</td>
        <td>{x.standard_operations}</td>
       </tr>)}</tbody>
      </table>
     </div>
    </details>

    <details className="guide-details">
     <summary>Operation Code Planning Order ({operationOrders.length})</summary>
     <div className="guide-chip-list">
      {operationOrders.map((x:any)=>
       <span className="guide-order-chip" key={x.operation_code}>
        <b>{x.planning_sort_order}</b> {x.operation_code}
       </span>)}
      {!operationOrders.length&&<span className="muted">Chưa gán Planning Order.</span>}
     </div>
    </details>

    <details className="guide-details">
     <summary>Recipe groups ({recipes.length})</summary>
     <div className="guide-chip-list">
      {recipes.map((x:any)=>
       <span className="guide-order-chip" key={`${x.process_family}-${x.recipe_group}`}>
        <b>{x.recipes}</b> {x.process_family} · {x.recipe_group}
       </span>)}
     </div>
    </details>

    <details className="guide-details">
     <summary>Auto Planning Rules đang active ({autoRules.length})</summary>
     <div className="guide-chip-list">
      {autoRules.map((x:any)=>
       <span className="guide-order-chip" key={x.standard_operation}>
        {x.standard_operation}
       </span>)}
      {!autoRules.length&&<span className="muted">
       Chưa có rule active; manual flow vẫn hoạt động độc lập.
      </span>}
     </div>
    </details>
   </section>

   <section id="quick" className="erp-table-panel guide-section">
    <div className="erp-panel-head">
     <b>9. Hướng dẫn thao tác nhanh</b>
     <span>Planner checklist</span>
    </div>

    <div className="guide-checklist">
     <div><b>① Import / cập nhật Master</b><span>Import Master → nếu cần Rebuild Chain để Candidate phản ánh routing mới.</span></div>
     <div><b>② Chọn Area</b><span>Planning Board → chọn Area để load toàn bộ Candidate thuộc Area; có thể chọn thêm Standard Operation để thu hẹp.</span></div>
     <div><b>③ Xem Route Matrix</b><span>DONE = đã qua · READY = được phép plan · WAITING = chưa đủ điều kiện.</span></div>
     <div><b>④ Chọn Job</b><span>Click trực tiếp READY cells. Nhiều Job chỉ gom cùng Main Operation và recipe/paint rule phù hợp.</span></div>
     <div><b>⑤ Chọn Target Batch</b><span>Create New Batch hoặc chọn Batch có sẵn cùng Operation để add nhanh.</span></div>
     <div><b>⑥ Điều độ</b><span>Board Điều Độ → chọn unscheduled Batch tại khu vực tương ứng → Resource/Date/Start/Duration → Save.</span></div>
     <div><b>⑦ Handover</b><span>Previous Batch đã Schedule → next Main của Job mới được mở READY theo schedule-gate.</span></div>
     <div><b>⑧ Khi thấy logic sai</b><span>Kiểm tra theo thứ tự: Routing Detail → Operation Mapping → ST Group/Area → Planning Chain → Batch → Schedule. Không sửa cứng ở UI.</span></div>
    </div>

    <div className="guide-dont">
     <h3>4 điều cần nhớ</h3>
     <div>
      <span>1</span><b>DONE/READY/WAITING dựa source_seq của full routing.</b>
     </div>
     <div>
      <span>2</span><b>Tạo Batch chưa mở Main kế tiếp; phải Schedule previous.</b>
     </div>
     <div>
      <span>3</span><b>Recipe Name chỉ lấy từ Process Recipe Master.</b>
     </div>
     <div>
      <span>4</span><b>Planning Order chỉ để sort, không quyết định route status.</b>
     </div>
    </div>
   </section>
  </section>
 </main>;
}
