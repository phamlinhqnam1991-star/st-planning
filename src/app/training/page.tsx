import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";

export const dynamic="force-dynamic";

type Step={title:string;detail:string;href?:string;action?:string};

function Card({title,children,tone="normal"}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){
 return <section className={`guide-rule guide-rule-${tone}`}><b>{title}</b><div>{children}</div></section>;
}
function Module({no,title,goal,steps}:{no:string;title:string;goal:string;steps:Step[]}){
 return <section className="erp-table-panel guide-section training-module">
  <div className="erp-panel-head"><div><b>{no} · {title}</b><small className="planning-sub">{goal}</small></div></div>
  <div className="lg-body">
   <ol className="lg-steps training-steps">{steps.map((s,i)=><li key={`${no}-${i}`}>
    <b>{s.title}</b> — {s.detail}
    {s.href?<div className="training-action"><Link className="btn small" href={s.href}>Mở màn hình</Link>{s.action?<span>{s.action}</span>:null}</div>:null}
   </li>)}</ol>
  </div>
 </section>;
}
function Check({children}:{children:React.ReactNode}){return <li><span className="training-check" aria-hidden="true">✓</span>{children}</li>}

export default function Page(){
 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="TRAINING"/>
  <AppTabs active="training"/>
  <section className="erp-content erp-content-full guide-page training-page">
   <div className="erp-page-head guide-head"><div><div className="erp-object-eyebrow">ONBOARDING · ST PLANNING</div><h2>Training người mới</h2><p>Học theo đúng flow thực tế: hiểu dữ liệu → đọc Job → tạo Batch → điều độ → báo cáo sản xuất → xử lý thay đổi và handoff.</p></div><div className="erp-command-actions"><Link className="btn" href="/logic-guide">Logic & Hướng dẫn</Link><Link className="btn primary" href="/all-open-jobs">Bắt đầu thực hành</Link></div></div>

   <div className="guide-jump">
    <a href="#trainer">Cách đào tạo</a><a href="#principles">6 nguyên tắc</a><a href="#path">Lộ trình</a><a href="#practice">Bài thực hành</a><a href="#exceptions">Tình huống lệch</a><a href="#checklist">Checklist đạt</a><a href="#quiz">Tự kiểm tra</a>
   </div>

   <section id="trainer" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>Nếu tôi là người hướng dẫn, tôi sẽ training theo cách này</b><small className="planning-sub">Không bắt người mới nhớ menu trước; bắt đầu bằng một Job thật và đi hết vòng đời của Job đó.</small></div></div>
    <div className="lg-body">
     <div className="lg-key lg-key-2">
      <Card title="Bước 1 · Cho thấy bức tranh tổng thể" tone="important">Giải thích 4 đối tượng phải phân biệt: <b>Job</b> là nhu cầu sản xuất; <b>Main Operation</b> là công đoạn planning; <b>Batch</b> là đơn vị vận hành; <b>Schedule</b> là thời gian/resource của Batch. Câu nhớ nhanh: <b>Planning nhìn theo Job — Production vận hành theo Batch.</b></Card>
      <Card title="Bước 2 · Theo một Job từ đầu đến cuối">Mở Job Tracker, xem Routing/Main chain/Recipe; sang Planning Board tạo Batch; sang Board Điều Độ gán Resource/Time; sang Production Execution báo cáo; cuối cùng xem Next Main và các cảnh báo downstream.</Card>
      <Card title="Bước 3 · Cho người học tự thao tác">Người hướng dẫn chỉ quan sát. Mỗi thao tác phải trả lời được 3 câu: <b>đang sửa đối tượng nào?</b> · <b>nguồn chuẩn là gì?</b> · <b>ảnh hưởng màn hình nào phía sau?</b></Card>
      <Card title="Bước 4 · Training tình huống sai/lệch" tone="warning">Sau flow chuẩn mới học: Job ngoài lô do Production thêm, Carry Over qua 06:00, Main trước trễ làm Main sau sai thời gian, Recipe mismatch, Batch Size vượt, Job đang thuộc Batch khác.</Card>
     </div>
    </div>
   </section>

   <section id="principles" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>6 nguyên tắc phải hiểu trước khi dùng app</b></div></div>
    <div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>#</th><th>Nguyên tắc</th><th>Ý nghĩa khi thao tác</th></tr></thead><tbody>
     <tr><td>1</td><td><b>RAW NextOperation → Mapping → Main Operation → Main Planning Order</b></td><td>Không hard-code thứ tự công đoạn theo tên. Operation Code Order chỉ tie-break trong cùng Main.</td></tr>
     <tr><td>2</td><td><b>Tạo Batch là handoff Planning</b></td><td>Main kế tiếp có thể được mở theo Sequential READY khi previous Main đã có Batch/DONE; Schedule là lớp resource/time, không phải gate READY.</td></tr>
     <tr><td>3</td><td><b>Một Job có thể có nhiều Batch ở cùng Main</b></td><td>Planning Board vẫn một dòng Job; cell Main hiển thị nhiều Batch bằng <b>&amp;</b>. Scheduling/Production vẫn là từng Batch riêng.</td></tr>
     <tr><td>4</td><td><b>Ngày sản xuất 06:00 → 05:59</b></td><td>Batch chưa hoàn thành trước 05:59 có thể trở thành Carry Over; đầu ngày mới planner review/duyệt chỉnh lịch.</td></tr>
     <tr><td>5</td><td><b>Production có thể thêm Job ngoài lô</b></td><td>Job hợp lệ được thêm trực tiếp vào Batch, không chờ approve; hệ thống ghi audit và tạo Attention cho Next Main phù hợp.</td></tr>
     <tr><td>6</td><td><b>Thay đổi thời gian phải tôn trọng dependency</b></td><td>Sau Carry Over, Start Main sau phải ≥ Effective End Main trước; engine còn kiểm tra resource overlap và có thể ảnh hưởng planner khác.</td></tr>
    </tbody></table></div></div>
   </section>

   <section id="path" className="training-path">
    <Module no="01" title="Hiểu Job và nguồn dữ liệu" goal="Biết Job đang ở đâu và vì sao nó xuất hiện trong ST" steps={[
     {title:"All Open Jobs",detail:"Tìm Job, đọc Part/Rev, Qty, Surface, RAW NextOperation, trạng thái và các cột ưu tiên.",href:"/all-open-jobs",action:"Không tạo Batch ở bước này."},
     {title:"Job Tracker",detail:"Xem toàn bộ thông tin liên quan của Job: route, Main chain, recipe/batch history, schedule và trạng thái.",href:"/job-tracker",action:"Đây là màn hình chẩn đoán đầu tiên khi có thắc mắc về một Job."},
     {title:"Part Tracker",detail:"Dùng khi cần kiểm tra nền kỹ thuật theo Part/Revision: Routing, Finish, Requirement và mapping.",href:"/part-tracker"},
    ]}/>
    <Module no="02" title="Planning Board — tạo Batch đúng" goal="Chọn đúng READY, đúng Main, đúng Recipe và đúng điều kiện gom lô" steps={[
     {title:"Đọc Route Matrix",detail:"Phân biệt READY / WAIT / PLANNED. Không chọn Main xa hơn khi chain chưa mở.",href:"/planning"},
     {title:"Chọn Job",detail:"Sau Job đầu tiên, Batch Selection Mode khóa theo Main + Recipe và các Batch Compatibility condition được cấu hình."},
     {title:"Tạo Batch",detail:"Batch No dùng Prefix + sequence. Nếu Auto Split bật, Batch Size chung hoặc theo Recipe có thể tách một Job thành nhiều Batch."},
     {title:"Kiểm tra kết quả",detail:"Cùng Job/cùng Main có nhiều Batch sẽ hiển thị dạng ASP_00001 & ASP_00002; không tạo fake Job row."},
    ]}/>
    <Module no="03" title="Board Điều Độ — biến Batch thành lịch khả thi" goal="Gán Resource/Start/Duration nhưng không phá constraint" steps={[
     {title:"Chọn Batch UNSCHEDULED",detail:"Batch đã được tạo ở Planning; không tạo lại Batch trong Scheduling.",href:"/schedule"},
     {title:"Gán Resource và thời gian",detail:"Kiểm tra cùng resource/lane, thời lượng, ngày sản xuất và các rule riêng của khu vực."},
     {title:"Chemical Line",detail:"Phải giữ Loading → Process → NDT → Unloading, Flybar occupancy và NDT spacing hiện hành; không chỉ cộng giờ đơn giản."},
     {title:"Dependency Main",detail:"Schedule phải khả thi với Main trước. Đặc biệt sau điều chỉnh đầu ngày, Start Main sau không được trước Effective End Main trước."},
    ]}/>
    <Module no="04" title="Production Execution — báo cáo đúng thực tế" goal="Báo cáo từng Batch và phản ánh thay đổi phát sinh tại sản xuất" steps={[
     {title:"Cập nhật Batch",detail:"Ghi Actual Start/End, trạng thái và ghi chú theo lô. Painting/Chemical Line vẫn report theo Batch; membership Job vẫn được load từ DB.",href:"/production-execution"},
     {title:"Job thêm ngoài lô",detail:"Nhập Job Number ở ngay Batch. Hệ thống tự lookup/validate và thêm trực tiếp nếu hợp lệ; không cần approve ở Điều chỉnh đầu ngày."},
     {title:"Job mới phải còn hiển thị",detail:"Sau reload, đổi tab hoặc tạo thêm Batch khác, Job Production-added vẫn hiện dưới đúng Batch vì membership đọc từ planning_batch_job."},
     {title:"Next Main Attention",detail:"Sau Production add, hệ thống tự tìm Next Main theo route thật và tìm Batch downstream phù hợp. Batch kế tiếp sẽ thấy Attention; Production có thể bấm Thêm Job này."},
    ]}/>
    <Module no="05" title="Điều chỉnh đầu ngày" goal="Xử lý lệch trước 05:59 mà không sửa mất lịch sử" steps={[
     {title:"Carry Over",detail:"Batch chưa hoàn thành được đưa vào review đầu ngày. Không tạo Batch No mới chỉ vì sang ngày.",href:"/daily-production-adjustment"},
     {title:"Preview trước khi duyệt",detail:"Engine tính Cross-Main Dependency + Resource Cascade, kể cả ảnh hưởng sang Main của planner khác."},
     {title:"Duyệt",detail:"Chỉ khi planner duyệt mới commit lịch mới. Lịch cũ giữ lịch sử/audit thay vì bị ghi đè."},
     {title:"Extra Job",detail:"Không cần approve tại đây. Tab chỉ ghi nhận/audit Job Production đã thêm trực tiếp vào Batch."},
    ]}/>
    <Module no="06" title="Cảnh báo thay đổi SX" goal="Planner đọc một nơi để biết Production đã thay đổi gì ngoài kế hoạch" steps={[
     {title:"Đọc alert",detail:"Xem Job/Part/Qty/Surface, Batch/Main/Recipe/Resource nguồn, Qty trước/sau và người/planner downstream bị ảnh hưởng.",href:"/production-change-alerts"},
     {title:"Theo dõi downstream",detail:"Biết Next Main nào phải nhận, Batch/Resource nào là đích, Planned Start và Attention đang chờ/đã nhận/chưa có lô."},
     {title:"Không sửa dữ liệu ở tab Alert",detail:"Đây là tab read-only để hiểu thay đổi; thao tác thực tế vẫn ở Production Execution, Scheduling hoặc Điều chỉnh đầu ngày."},
    ]}/>
   </section>

   <section id="practice" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>Bài thực hành bắt buộc cho người mới</b><small className="planning-sub">Nên dùng dữ liệu test hoặc Job được trainer chỉ định.</small></div></div>
    <div className="lg-body"><ol className="lg-steps">
     <li><b>Bài 1 · Theo dấu một Job:</b> tìm ở All Open Jobs → Job Tracker → xác định Current/Next Main, Recipe và previous handoff.</li>
     <li><b>Bài 2 · Tạo Batch:</b> chọn một Job READY → kiểm tra Batch Compatibility → tạo Batch → giải thích vì sao Main kế tiếp READY/WAIT.</li>
     <li><b>Bài 3 · Điều độ:</b> đưa Batch UNSCHEDULED vào một Resource/Start/Duration hợp lệ → kiểm tra không overlap.</li>
     <li><b>Bài 4 · Production add:</b> ở một Batch đang report, nhập Job ngoài lô hợp lệ → xác nhận Job xuất hiện dưới Batch → mở Cảnh báo thay đổi SX → kiểm tra Next Main Attention.</li>
     <li><b>Bài 5 · Carry Over:</b> mô phỏng Batch chưa hoàn thành trước 05:59 → mở Điều chỉnh đầu ngày → đọc preview các Main/Resource bị ảnh hưởng → chỉ duyệt khi hiểu toàn bộ change-set.</li>
    </ol></div>
   </section>

   <section id="exceptions" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>Tình huống người mới phải biết xử lý</b></div></div>
    <div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Tình huống</th><th>Không làm</th><th>Làm đúng</th></tr></thead><tbody>
     <tr><td>Job không READY</td><td>Không cố tạo Batch bằng cách sửa dữ liệu khác.</td><td>Mở Job Tracker/Route Matrix, xác định previous Main, ST Scope/Mapping hoặc chain gap.</td></tr>
     <tr><td>Recipe mismatch khi Add Job</td><td>Không đổi Recipe của Batch để “cho qua”.</td><td>Đọc validation; chọn Batch đúng Recipe hoặc xử lý exception theo nghiệp vụ.</td></tr>
     <tr><td>Job đã ở Batch active khác</td><td>Không tạo duplicate allocation.</td><td>Kiểm tra Batch hiện tại và quyết định move/remove đúng quy trình.</td></tr>
     <tr><td>Production thêm Job ngoài lô</td><td>Không chờ tab Điều chỉnh approve.</td><td>Job được thêm trực tiếp nếu hợp lệ; kiểm tra audit + Next Main Attention.</td></tr>
     <tr><td>Main trước trễ 07:00 → 09:00</td><td>Không chỉ sửa riêng Main trước.</td><td>Đầu ngày review dependency: Main sau + resource cascade, kể cả planner khác.</td></tr>
     <tr><td>Carry Over</td><td>Không tạo Batch mới chỉ vì đổi ngày.</td><td>Giữ Batch, thêm/điều chỉnh execution/schedule segment qua flow Điều chỉnh đầu ngày.</td></tr>
    </tbody></table></div></div>
   </section>

   <section id="checklist" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>Checklist trước khi cho người mới thao tác độc lập</b></div></div>
    <div className="lg-body"><ul className="training-checklist">
     <Check>Giải thích được Job / Main Operation / Batch / Schedule khác nhau thế nào.</Check>
     <Check>Biết READY/WAIT dựa Planning Chain; biết Schedule không phải gate mở Next Main.</Check>
     <Check>Tạo được Batch đúng Recipe và hiểu Batch Size / Auto Split.</Check>
     <Check>Điều độ được Batch và đọc được Resource conflict/dependency.</Check>
     <Check>Báo cáo Production và thêm Job ngoài lô mà không tạo duplicate.</Check>
     <Check>Biết Production-added Job sẽ tạo audit + Next Main Attention.</Check>
     <Check>Biết đọc tab Điều chỉnh đầu ngày và không duyệt change-set khi chưa hiểu impact.</Check>
     <Check>Biết dùng Cảnh báo thay đổi SX để theo dõi thay đổi xuyên planner/Main.</Check>
     <Check>Khi nghi ngờ dữ liệu, biết dùng Job Tracker trước khi chỉnh Configuration/Master.</Check>
    </ul></div>
   </section>

   <section id="quiz" className="erp-table-panel guide-section">
    <div className="erp-panel-head"><div><b>Tự kiểm tra nhanh</b><small className="planning-sub">Người mới nên trả lời đúng trước khi thao tác thật.</small></div></div>
    <div className="lg-body">
     <details className="lg-faq"><summary>Job đã có Batch nhưng chưa Schedule thì Next Main có thể READY không?</summary><div><b>Có</b>, theo Sequential READY hiện tại: Batch PLANNED-UNSCHEDULED đã là handoff planning hợp lệ. Tuy nhiên lịch thực tế vẫn phải thỏa dependency khi Scheduling/Carry Over.</div></details>
     <details className="lg-faq"><summary>Production thêm Job vào BSA Batch thì có cần planner approve ở Điều chỉnh đầu ngày không?</summary><div><b>Không.</b> Nếu validation hợp lệ, Job được thêm trực tiếp vào Batch, ghi audit và tạo Attention cho Next Main/downstream Batch phù hợp.</div></details>
     <details className="lg-faq"><summary>Shot Peening dời End từ 07:00 sang 09:00, BSAUNSLD của planner khác đang Start 07:30 thì sao?</summary><div>Lịch đó không còn khả thi. Preview đầu ngày phải tính Cross-Main Dependency, đề xuất Start BSAUNSLD sau Effective End của Shot Peening, rồi kiểm tra tiếp resource cascade.</div></details>
     <details className="lg-faq"><summary>Một Job split thành 2 Batch thì Planning Board hiển thị thế nào?</summary><div>Vẫn một Job row, cùng Main cell hiển thị các Batch No nối bằng <b>&amp;</b>. Scheduling và Production vẫn tách từng Batch để vận hành.</div></details>
    </div>
   </section>
  </section>
 </main>;
}
