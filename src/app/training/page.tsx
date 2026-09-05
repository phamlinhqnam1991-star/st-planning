import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";

export const dynamic="force-dynamic";

type Step={title:string;detail:string;href?:string;action?:string};
function Card({title,children,tone="normal"}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){return <section className={`guide-rule guide-rule-${tone}`}><b>{title}</b><div>{children}</div></section>}
function Module({no,title,goal,steps}:{no:string;title:string;goal:string;steps:Step[]}){return <section className="erp-table-panel guide-section training-module"><div className="erp-panel-head"><div><b>{no} · {title}</b><small className="planning-sub">{goal}</small></div></div><div className="lg-body"><ol className="lg-steps training-steps">{steps.map((s,i)=><li key={`${no}-${i}`}><b>{s.title}</b> — {s.detail}{s.href?<div className="training-action"><Link className="btn small" href={s.href}>Mở màn hình</Link>{s.action?<span>{s.action}</span>:null}</div>:null}</li>)}</ol></div></section>}
function Check({children}:{children:React.ReactNode}){return <li><span className="training-check" aria-hidden="true">✓</span>{children}</li>}

export default function Page(){return <main className="erp-shell erpkit-migrated-page">
 <ErpAppHeader module="TRAINING"/><AppTabs active="training"/>
 <section className="erp-content erp-content-full guide-page training-page">
  <div className="erp-page-head guide-head"><div><div className="erp-object-eyebrow">ONBOARDING · ST PLANNING · V473</div><h2>Training người mới — từ lý thuyết đến vận hành</h2><p>Học từ khái niệm chung nhất → cấu hình Operation Code → Mapping/Main/Area/Planner → Recipe & Time Rules → Planning → Batch → Scheduling → Production → xử lý ngoại lệ.</p></div><div className="erp-command-actions"><Link className="btn" href="/logic-guide">Logic & Hướng dẫn</Link><Link className="btn primary" href="/job-tracker">Mở Job Tracker</Link></div></div>

  <div className="guide-jump"><a href="#map">Bản đồ hệ thống</a><a href="#theory">Lý thuyết nền</a><a href="#config">Từ Operation Code đến điều độ</a><a href="#recipe">Recipe</a><a href="#time">Time Rules</a><a href="#example">Ví dụ 1 Job</a><a href="#normal-flow">Flow thao tác</a><a href="#scenarios">Tình huống</a><a href="#practice">Thực hành</a><a href="#checklist">Kiểm tra đạt</a></div>

  <section id="map" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>0 · Bức tranh lớn — phải hiểu trước khi bấm bất kỳ nút nào</b><small className="planning-sub">Trainer phải giải thích được sơ đồ này trước khi cho học viên vào Planning Board.</small></div></div><div className="lg-body">
   <div className="lg-key lg-key-2">
    <Card title="Dữ liệu kỹ thuật" tone="important"><b>Part/Revision + Routing + RAW Operation Code</b> cho biết Job phải đi qua những bước kỹ thuật nào. App không được tự đoán thứ tự bằng tên công đoạn.</Card>
    <Card title="Lớp cấu hình Planning"><b>Operation Code → ST Scope → ST Group → Main Operation → Main Planning Order → Area → Planner</b>. Lớp này biến routing kỹ thuật thành chuỗi công đoạn cần lập kế hoạch.</Card>
    <Card title="Lớp công nghệ"><b>Recipe + Batch Compatibility + Batch Size + Process Time Rules</b> quyết định Job nào có thể gom cùng lô và lô cần bao nhiêu thời gian.</Card>
    <Card title="Lớp vận hành"><b>Job → Batch → Resource → Schedule → Production Execution</b>. Câu nhớ: <b>Planning nhìn theo Job; Production vận hành theo Batch.</b></Card>
   </div>
   <p><b>Chuỗi nguồn chuẩn:</b> RAW NextOperation → ST Operation Mapping → Main Operation → Main Planning Order. Operation Code Order chỉ dùng tie-break bên trong cùng Main; không được hard-code “tên A luôn trước tên B”.</p>
  </div></section>

  <section id="theory" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>1 · Lý thuyết nền — từ chung nhất đến chi tiết nhất</b></div></div><div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Khái niệm</th><th>Hiểu đơn giản</th><th>Nguồn / vai trò</th><th>Sai lầm thường gặp</th></tr></thead><tbody>
   <tr><td><b>Job</b></td><td>Một nhu cầu sản xuất cụ thể của Part/Revision với Qty/WIP.</td><td>All Open Jobs là nguồn công việc hiện hành.</td><td>Nhầm Job với Batch.</td></tr>
   <tr><td><b>Operation Code</b></td><td>Mã bước kỹ thuật thật trong routing.</td><td>Được mapping vào ST Scope/ST Group/Main.</td><td>Tự sắp xếp bằng tên code thay vì mapping/order.</td></tr>
   <tr><td><b>ST Scope</b></td><td>Xác định operation có thuộc phạm vi ST hay không.</td><td>ST_SCOPE_ONLY có thể hiện theo NextOperation nhưng không tham gia Planning Chain/Batch/Board.</td><td>Đưa ST_SCOPE_ONLY vào Batch.</td></tr>
   <tr><td><b>ST Group</b></td><td>Nhóm logic các Operation Code tương đồng.</td><td>Cầu nối kỹ thuật giữa code và Main/Area.</td><td>Nhầm ST Group với Physical Area.</td></tr>
   <tr><td><b>Main Operation</b></td><td>Đơn vị mà planner thực sự lập kế hoạch.</td><td>Ví dụ V_A-SHPN, BSAUNSLD, PRIMER, TOPCOAT1.</td><td>Lập kế hoạch trực tiếp cho mọi raw code.</td></tr>
   <tr><td><b>Main Planning Order</b></td><td>Thứ tự Main trong chain planning.</td><td>Dùng để xác định Previous/Next Main của Job.</td><td>Hard-code Shot Peening → BSA cho mọi Job.</td></tr>
   <tr><td><b>Physical Area</b></td><td>Khu vực vật lý thực hiện.</td><td>Mapping qua Area/Operation Group.</td><td>Nhầm Area với Resource.</td></tr>
   <tr><td><b>Schedule Area</b></td><td>Nhóm hiển thị/điều độ.</td><td>Giúp board gom đúng khu vực vận hành.</td><td>Dùng Schedule Area thay cho Main chain.</td></tr>
   <tr><td><b>Planner Owner</b></td><td>Người chịu trách nhiệm planning Main/khu vực.</td><td>Không được làm đứt dependency xuyên planner.</td><td>Planner 1 đổi lịch mà bỏ qua Main của Planner 2.</td></tr>
   <tr><td><b>Recipe</b></td><td>Công thức/quy trình công nghệ áp dụng cho Main.</td><td>Resolve từ Recipe Master/Rule và dữ liệu Job.</td><td>Đổi Recipe của Batch để ép Job mismatch vào.</td></tr>
   <tr><td><b>Batch Key</b></td><td>Khóa gom Job theo các cột cấu hình.</td><td>Có thể dùng nhiều cột từ All Open Job.</td><td>Coi Batch Key là Batch No.</td></tr>
   <tr><td><b>Batch</b></td><td>Đơn vị vận hành gồm một hoặc nhiều allocation Job.</td><td>Batch No = Prefix + sequence; có thể auto split theo size.</td><td>Tạo lại Batch ở Scheduling.</td></tr>
   <tr><td><b>Resource</b></td><td>Máy/Cabin/Flybar/lane thực hiện Batch.</td><td>Được gán ở Scheduling.</td><td>Cho 2 Batch overlap resource không cho phép.</td></tr>
   <tr><td><b>Schedule</b></td><td>Resource + Start + Duration/End của Batch.</td><td>Phải thỏa resource và dependency Main.</td><td>Nghĩ Schedule là điều kiện duy nhất mở READY.</td></tr>
   <tr><td><b>Production Execution</b></td><td>Thực tế sản xuất của Batch.</td><td>Actual Start/End, status, note, Job phát sinh.</td><td>Sửa ngược Planning âm thầm mà không audit.</td></tr>
  </tbody></table></div></div></section>

  <section id="config" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>2 · Một Operation Code đi vào hệ thống như thế nào?</b><small className="planning-sub">Đây là phần trainer phải dạy trước Planning Board.</small></div></div><div className="lg-body"><ol className="lg-steps">
   <li><b>Bước A — Tạo/nhận Operation Code:</b> Operation Code là mã kỹ thuật từ routing. Ví dụ minh họa <b>V_A-SHPN</b>. Không tạo Main chỉ vì muốn có một dòng trên board.</li>
   <li><b>Bước B — Xác định ST Scope:</b> nếu operation thuộc phạm vi lập kế hoạch ST thì mapping đúng scope. Nếu chỉ là ST_SCOPE_ONLY thì nó có thể được theo dõi nhưng không tham gia Batch/Planning Chain.</li>
   <li><b>Bước C — Gán ST Group:</b> đưa code vào nhóm phù hợp. Ví dụ nhóm Shot Peening. Một group có thể chứa nhiều Operation Code chi tiết.</li>
   <li><b>Bước D — Gán Main Operation:</b> Main là cấp planner làm việc. Operation Code kế thừa Main Planning Order của Main; Operation Code Order chỉ giải quyết thứ tự chi tiết trong cùng Main.</li>
   <li><b>Bước E — Gán Area:</b> Main/ST Group được mapping tới Physical Area và Schedule Area để board biết hiển thị ở đâu.</li>
   <li><b>Bước F — Gán Planner Owner:</b> xác định trách nhiệm. Nhưng dependency vẫn chạy xuyên planner.</li>
   <li><b>Bước G — Cấu hình Batch:</b> Prefix, sequence, padding, Common Batch Size, Auto Split và nếu cần Batch Size theo Recipe.</li>
   <li><b>Bước H — Cấu hình Recipe/Batch Key:</b> chọn nguồn cột thật từ All Open Job, rule resolve recipe và điều kiện Job được gom cùng Batch.</li>
   <li><b>Bước I — Cấu hình Time Rules:</b> Fixed hoặc rule theo Qty/Surface; Scheduling dùng duration đã resolve và vẫn cho override theo flow hiện hành.</li>
   <li><b>Bước J — Kiểm tra bằng Job Tracker:</b> trước khi plan thật, phải nhìn một Job có code đó và xác nhận Main chain, Recipe, Area, Planner, Previous/Next Main đúng.</li>
  </ol><Card title="Quy tắc an toàn cấu hình" tone="warning">Không sửa Master/Mapping chỉ để làm cho một Job riêng lẻ “READY”. Nếu một Job sai, mở Job Tracker để xác định nguồn sai trước: raw routing, mapping, Main, recipe rule hay trạng thái handoff.</Card></div></section>

  <section id="recipe" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>3 · Recipe, Batch Key và Batch Size — hiểu đúng trước khi gom lô</b></div></div><div className="lg-body">
   <p><b>Recipe</b> trả lời “Batch này chạy công nghệ nào?”. <b>Batch Key/Compatibility</b> trả lời “Job nào được phép đi chung?”. <b>Batch Size</b> trả lời “một Batch chứa tối đa/chuẩn bao nhiêu Qty theo cấu hình?”. Ba khái niệm này liên quan nhưng không phải một.</p>
   <div className="lg-key lg-key-2"><Card title="Recipe resolve">Chemical Line có thể resolve theo Operation Code. Paint dùng Process Recipe Master và occurrence PRIMER/PRIMER2/PRIMER3, TOPCOAT1/TOPCOAT2… theo logic hiện hành. Main khác có thể dùng các cột All Open Job được cấu hình.</Card><Card title="Recipe-specific Batch Size">Ưu tiên: <b>Main + Recipe override</b> → Common Batch Size → nếu cả hai trống thì không split. Auto Split OFF thì không split dù có size.</Card></div>
   <p>Ví dụ Job Qty 24, Batch Size 12 → tạo 2 Batch thật, mỗi Batch 12. Planning Board vẫn một Job row và cell Main có thể hiện <b>ASP_00001 &amp; ASP_00002</b>; Scheduling/Production vận hành riêng từng Batch.</p>
  </div></section>

  <section id="time" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>4 · Time Rules — từ Process Time đến lịch điều độ</b></div></div><div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Loại</th><th>Cách hiểu</th><th>Ví dụ</th><th>Khi điều độ</th></tr></thead><tbody>
   <tr><td>Fixed</td><td>Thời gian cố định theo operation/process.</td><td>Ví dụ một bước được cấu hình 05:00.</td><td>Start + Fixed Duration = End, trừ override hợp lệ.</td></tr>
   <tr><td>Qty/Surface Rule</td><td>Chọn rule theo tổng Qty và Surface của Batch.</td><td>Paint có thể có các ngưỡng Qty/dm² khác nhau.</td><td>Mỗi Batch split phải tính lại bằng Qty/Surface allocation của chính Batch.</td></tr>
   <tr><td>Chemical Line stages</td><td>Không chỉ một duration tổng.</td><td>Loading → Process → NDT → Unloading.</td><td>Giữ Flybar occupancy; NDT recipe áp dụng và spacing 01:30 theo rule hiện hành.</td></tr>
   <tr><td>Dependency time</td><td>Main sau không được chạy trước khi Main trước thực sự khả thi.</td><td>Shot Peening End đổi 07:00 → 09:00.</td><td>BSAUNSLD Start 07:30 trở thành conflict và phải được review/reschedule.</td></tr>
  </tbody></table></div><p><b>Phân biệt:</b> Planning READY là handoff logic; Scheduling feasibility là khả thi thời gian/resource. Một Main có thể đã được mở cho planning nhưng lịch cuối cùng vẫn phải tôn trọng Effective End của Previous Main.</p></div></section>

  <section id="example" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>5 · Ví dụ đào tạo hoàn chỉnh — một Job đi từ Operation Code đến Production</b><small className="planning-sub">Ví dụ mô phỏng để học flow; trainer có thể thay bằng Job thật trong Job Tracker.</small></div></div><div className="lg-body">
   <Card title="Job mẫu"><b>Job J-TRAIN-001</b> · Part P-TRAIN-100 · Rev A · Qty 24. Routing ST minh họa: <b>V_A-SHPN → BSAUNSLD → PRIMER → TOPCOAT1</b>.</Card>
   <ol className="lg-steps">
    <li><b>V_A-SHPN xuất hiện trong routing.</b> Mapping cho biết nó thuộc ST, thuộc group Shot Peening, Main Planning = V_A-SHPN, có Area/Planner tương ứng và Main Planning Order đứng trước BSAUNSLD.</li>
    <li><b>BSAUNSLD</b> được mapping thành Main Chemical Line tương ứng. Nó là Next Main của Job theo route/order thật, không phải vì code được hard-code sau Shot Peening.</li>
    <li><b>PRIMER</b> resolve Recipe từ dữ liệu paint/Process Recipe Master. Giả sử Recipe 001 và Batch Size theo Recipe = 12 pcs.</li>
    <li><b>Planning V_A-SHPN:</b> Job READY → planner chọn Job → tạo Batch. Nếu Batch Size của V_A-SHPN là 12 và Auto Split ON, Qty 24 có thể thành ASP_00001 + ASP_00002.</li>
    <li><b>Planning handoff:</b> sau khi previous Main có handoff planning hợp lệ, Next Main có thể được mở theo Sequential READY. Không cần giả vờ rằng previous operation đã sản xuất xong để mở Planning.</li>
    <li><b>Planning BSAUNSLD:</b> tạo lô BSA phù hợp recipe/key. Nếu các Job từ ASP đi chung BSA, batch relationship/history giúp downstream theo dõi.</li>
    <li><b>Planning PRIMER:</b> Recipe 001, Batch Size 12. Qty 24 có thể tạo PRI00001 và PRI00002 tùy selection/allocation thực tế.</li>
    <li><b>Scheduling:</b> đưa từng Batch UNSCHEDULED vào đúng Resource. ASP có resource Shot Peening; BSA vào Chemical Line/Flybar; PRI vào Painting Cabin. Không tạo Batch mới ở bước này.</li>
    <li><b>Time:</b> giả sử ASP dự kiến End 07:00 và BSA Start 07:30. Nếu Production ASP thực tế/carry-over làm Effective End thành 09:00 thì lịch BSA 07:30 không còn khả thi.</li>
    <li><b>Production:</b> report Actual Start/End/status theo Batch. Nếu Production thêm J-EXTRA-008 vào BSA ngoài kế hoạch, Job được lookup/validate rồi thêm trực tiếp nếu hợp lệ; audit được ghi lại.</li>
    <li><b>Next Main Attention:</b> hệ thống tìm route của J-EXTRA-008, thấy Next Main PRIMER, rồi tìm Batch PRIMER downstream phù hợp dựa trên Main/quan hệ/Job overlap. Production PRIMER thấy Attention “cần thêm Job này”.</li>
    <li><b>Đầu ngày:</b> ngày sản xuất là 06:00 → 05:59. Batch chưa hoàn thành tạo Carry Over review. Planner xem toàn bộ Cross-Main + Resource impact rồi mới duyệt chỉnh lịch.</li>
   </ol>
  </div></section>

  <section id="normal-flow" className="training-path">
   <Module no="06" title="Flow thao tác chuẩn hằng ngày" goal="Biết màn hình nào dùng để xem, màn hình nào được phép thay đổi dữ liệu" steps={[
    {title:"All Open Jobs",detail:"Kiểm tra nguồn Job, RAW NextOperation, Qty/Surface và priority.",href:"/all-open-jobs"},
    {title:"Job Tracker",detail:"Chẩn đoán route/Main/Recipe/Batch/Schedule trước khi sửa bất kỳ cấu hình nào.",href:"/job-tracker"},
    {title:"Planning Board",detail:"Chọn READY, đúng Main/Recipe/compatibility; tạo Batch hoặc Auto Split.",href:"/planning"},
    {title:"Board Điều Độ",detail:"Chọn Batch UNSCHEDULED, gán Resource/Start/Duration; kiểm tra constraint.",href:"/schedule"},
    {title:"Production Execution",detail:"Report thực tế; thêm Job ngoài lô trực tiếp nếu validation hợp lệ.",href:"/production-execution"},
    {title:"Điều chỉnh đầu ngày",detail:"Review Carry Over và preview dependency/resource cascade trước khi duyệt.",href:"/daily-production-adjustment"},
    {title:"Cảnh báo thay đổi SX",detail:"Read-only audit để planner biết Production đã thay đổi gì và downstream nào bị ảnh hưởng.",href:"/production-change-alerts"},
   ]}/>
  </section>

  <section id="scenarios" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>7 · Thư viện tình huống — người mới phải biết trước khi thao tác độc lập</b><small className="planning-sub">Không cố “sửa cho chạy”; phải nhận diện đúng lớp dữ liệu đang có vấn đề.</small></div></div><div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Tình huống</th><th>Hệ thống/ý nghĩa</th><th>Người dùng phải làm</th></tr></thead><tbody>
   <tr><td>Job không xuất hiện</td><td>Có thể do nguồn All Open Job/routing/ST scope.</td><td>Tìm All Open Jobs → Job Tracker → Part Tracker; không sửa Main bừa.</td></tr>
   <tr><td>RAW NextOperation có nhưng Main sai</td><td>Khả năng mapping Operation Code/Main sai.</td><td>Kiểm tra ST Operation Mapping và Main Planning Order.</td></tr>
   <tr><td>ST_SCOPE_ONLY</td><td>Được theo dõi nhưng không tham gia Planning Chain/Batch/Board.</td><td>Không cố tạo Batch.</td></tr>
   <tr><td>Job WAIT</td><td>Previous Main chưa có handoff planning hợp lệ hoặc chain có gap.</td><td>Xem Route Matrix/Job Tracker và previous Main.</td></tr>
   <tr><td>Job READY nhưng chưa Schedule</td><td>Planning và Scheduling là hai lớp khác nhau.</td><td>Có thể tạo Batch; sau đó điều độ để biến thành lịch khả thi.</td></tr>
   <tr><td>Recipe không resolve</td><td>Thiếu/mismatch Recipe Rule hoặc dữ liệu nguồn.</td><td>Kiểm tra Recipe Master/Rule và cột nguồn; không nhập recipe giả.</td></tr>
   <tr><td>Recipe mismatch khi Add Job</td><td>Job không tương thích công nghệ với Batch.</td><td>Không đổi Recipe Batch để cho qua; chọn Batch đúng hoặc xử lý exception có kiểm soát.</td></tr>
   <tr><td>Batch Key mismatch</td><td>Job không thỏa điều kiện gom lô.</td><td>Đọc condition nào fail; không bypass âm thầm.</td></tr>
   <tr><td>Batch Size trống</td><td>Nếu không có Recipe override/Common size thì không split.</td><td>Batch giữ selection thành một lô.</td></tr>
   <tr><td>Recipe Batch Size có giá trị</td><td>Override size chung cho đúng Main+Recipe.</td><td>Hiểu size nguồn RECIPE trước khi thắc mắc vì sao split.</td></tr>
   <tr><td>Auto Split OFF</td><td>Không split dù có size.</td><td>Không kỳ vọng hệ thống tự tách.</td></tr>
   <tr><td>Job Qty 30, size 12</td><td>Có thể tạo 12 + 12 + 6.</td><td>Kiểm tra Qty/Surface/Process Time riêng từng Batch.</td></tr>
   <tr><td>Một Job ở nhiều Batch cùng Main</td><td>Hợp lệ với split allocation.</td><td>Planning Board hiện A &amp; B; Scheduling/Production vẫn tách Batch.</td></tr>
   <tr><td>Job đã ở Batch active khác</td><td>Nguy cơ duplicate allocation.</td><td>Không add tiếp; kiểm tra/move/remove theo flow đúng.</td></tr>
   <tr><td>Resource overlap</td><td>Hai lịch tranh cùng năng lực.</td><td>Dời Start/Resource hoặc dùng engine/rule của khu vực.</td></tr>
   <tr><td>Chemical Flybar conflict</td><td>Phải xét Loading/Process/NDT/Unloading và occupancy.</td><td>Không chỉ kéo End bằng tay.</td></tr>
   <tr><td>NDT preclean</td><td>Các recipe preclean hiện hành có NDT fixed và spacing.</td><td>Giữ rule NDT 01:30 giữa NDT Start khi áp dụng.</td></tr>
   <tr><td>Previous Main End trễ</td><td>Current Main có thể thành dependency conflict.</td><td>Review Cross-Main; Start current ≥ Effective End previous (+ buffer nếu cấu hình).</td></tr>
   <tr><td>Planner khác bị ảnh hưởng</td><td>Planner Owner không cắt dependency.</td><td>Change-set phải hiển thị impact xuyên planner.</td></tr>
   <tr><td>Batch chưa xong trước 05:59</td><td>Carry Over pending sang ngày sản xuất mới.</td><td>Không tạo Batch No mới chỉ vì qua ngày; review đầu ngày.</td></tr>
   <tr><td>Carry Over chiếm đầu ngày</td><td>Có thể đẩy các Batch sau cùng resource và Main downstream.</td><td>Xem preview rồi mới Duyệt chỉnh lịch.</td></tr>
   <tr><td>Job planned trong Batch nhưng Not Started</td><td>Có thể là missing production item.</td><td>Đầu ngày xem đề xuất remove/carry theo trạng thái thực tế; giữ audit.</td></tr>
   <tr><td>Job đã bắt đầu nhưng chưa xong</td><td>Không nên remove như chưa từng chạy.</td><td>Carry remaining Qty/Duration.</td></tr>
   <tr><td>Production thêm Job ngoài lô</td><td>Thay đổi thực tế đã xảy ra.</td><td>Nhập Job No.; hệ thống lookup/validate; hợp lệ thì add trực tiếp, không chờ approve.</td></tr>
   <tr><td>Production-added Job reload trang</td><td>Membership phải lấy từ DB.</td><td>Job vẫn phải hiện dưới Batch sau reload/đổi tab/tạo Batch mới.</td></tr>
   <tr><td>Production add ở BSA</td><td>Next Main của Job có thể là PRIMER hoặc Main khác theo route thật.</td><td>Kiểm tra Next Main Attention, không hard-code BSA→PRIMER.</td></tr>
   <tr><td>Downstream Batch tìm được</td><td>Attention gắn vào Batch Main kế tiếp phù hợp.</td><td>Production downstream đọc alert và “Thêm Job này” khi hợp lệ.</td></tr>
   <tr><td>Chưa có downstream Batch</td><td>Không có nơi để auto/attention add trực tiếp.</td><td>Alert phải nói rõ chưa có lô Main sau; planner tạo/plan đúng flow.</td></tr>
   <tr><td>Downstream Batch đã chạy</td><td>Late upstream addition có rủi ro thực tế.</td><td>Không âm thầm coi Job đã sản xuất; người vận hành phải xử lý theo trạng thái thực tế.</td></tr>
   <tr><td>Preparation Masking/Unmasking</td><td>Support operation được config theo Main; explicit config là strict.</td><td>Không tự thêm support ngoài config; Production giữ execution độc lập.</td></tr>
   <tr><td>Job nghi sai dữ liệu</td><td>Có thể sai ở nhiều lớp.</td><td>Thứ tự kiểm tra: Job Tracker → raw route → mapping → Main → recipe → batch → schedule → production audit.</td></tr>
  </tbody></table></div></div></section>

  <section id="practice" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>8 · Chương trình thực hành do trainer giao</b></div></div><div className="lg-body"><ol className="lg-steps">
   <li><b>Lý thuyết miệng:</b> học viên tự vẽ lại chuỗi Operation Code → ST Group → Main → Area/Planner → Recipe/Time → Batch → Schedule → Production.</li>
   <li><b>Trace 1 Job:</b> trainer đưa Job thật; học viên không được tạo Batch, chỉ giải thích route, Current Main, Next Main, Recipe, Time source và vì sao READY/WAIT.</li>
   <li><b>Plan 1 Job:</b> tạo Batch đúng Main/Recipe; giải thích Batch No, size, split và tác động lên Next Main.</li>
   <li><b>Schedule 1 Batch:</b> chọn resource/time hợp lệ và giải thích dependency với previous Main.</li>
   <li><b>Production:</b> report Batch, thêm một Job test ngoài lô, kiểm tra persistence + Production Change Alert + Next Main Attention.</li>
   <li><b>Carry Over simulation:</b> đổi End previous Main 07:00 → 09:00; học viên phải chỉ ra tất cả Main/resource/planner có thể bị ảnh hưởng trước khi duyệt.</li>
   <li><b>Troubleshooting:</b> trainer tạo 5 lỗi: WAIT, recipe mismatch, duplicate batch membership, resource overlap, downstream attention chưa có batch; học viên phải tìm đúng nguồn.</li>
  </ol></div></section>

  <section id="checklist" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>9 · Điều kiện đạt trước khi dùng app thật</b></div></div><div className="lg-body"><ul className="training-checklist">
   <Check>Giải thích được Operation Code, ST Group, Main Operation, Area, Resource khác nhau.</Check>
   <Check>Giải thích được RAW NextOperation → Mapping → Main → Main Planning Order.</Check>
   <Check>Biết Recipe, Batch Key, Batch Size và Time Rule là bốn lớp khác nhau.</Check>
   <Check>Biết READY/WAIT là Planning Chain; Scheduling feasibility là lớp thời gian/resource.</Check>
   <Check>Trace được một Job từ All Open Jobs đến Job Tracker và xác định Previous/Current/Next Main.</Check>
   <Check>Tạo Batch đúng Recipe, hiểu Auto Split và nhiều Batch trên cùng Job/Main.</Check>
   <Check>Điều độ mà không tạo lại Batch và không phá dependency/resource constraint.</Check>
   <Check>Biết Production add Job ngoài lô, audit, persistence và Next Main Attention.</Check>
   <Check>Biết Carry Over 06:00–05:59 và chỉ duyệt sau khi đọc Cross-Main/Resource impact.</Check>
   <Check>Khi có lỗi, biết chẩn đoán từ nguồn thay vì sửa Master để ép kết quả.</Check>
  </ul></div></section>

  <section className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>Bổ sung V473 — thứ tự Area, Preparation split và READY handoff</b></div></div><div className="lg-body">
   <ul>
    <li><b>Area Display Order:</b> người mới phải hiểu <code>Physical Area</code> khác <code>Schedule Area</code>. Tab Configuration → Area Display Order chỉ đổi thứ tự hiển thị bằng <code>md_area.sort_order</code>, không đổi nơi Job được điều độ.</li>
    <li><b>Masking/Unmasking Preparation:</b> báo cáo Production tách riêng theo Main đích. PRIMER, PRIMER2, PRIMER3, TOPCOAT1, TOPCOAT2 và ANTI-ABRASION là các bảng Preparation riêng; không được nhìn một bảng Painting tổng rồi nhầm Main.</li>
    <li><b>READY handoff:</b> cột <b>READY · chính trước Scheduled / Done</b> gồm cả Previous Main đã Schedule và Previous Main đã DONE theo physical progress dù dữ liệu cũ không có Batch. Cột <b>READY · chính trước chưa Scheduled / START</b> là plan-ahead chưa handoff hoặc Main đầu tiên.</li>
   </ul>
   <div className="notice"><b>Bài kiểm tra:</b> Cho Job J-TRAIN-001 có Previous Main A-SHPN đã DONE ngoài hệ thống cũ, không có Batch, Current Main BSAUNSLD đang ELIGIBLE. Học viên phải trả lời đúng: Job nằm ở READY · chính trước Scheduled / Done, không phải READY · chính trước chưa Scheduled.</div>
  </div></section>
 </section>
 

</main>}
