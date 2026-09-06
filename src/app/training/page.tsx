// V499 Training sync: Scheduling MAIN TOTAL stays compact; click existing Recipe-row detail lines directly to open the filtered Quick View. Canonical workload/READY/WAIT/Batch/Schedule logic remains unchanged.
// V510 Training sync: Internal Chat is Aiven-backed, uses V509 Global Realtime No-Supabase, supports group/direct chat + unread badges, and operational commits emit immediate SYSTEM messages. Existing alerts remain canonical workflows.
// V494 Training sync: Recent Batches adds per-Batch Excel export using real planning_batch_job membership and the Planning Matrix-style Job/route/recipe columns. Export is read-only.
// V493 Training sync: Planning Board Quick View keeps V492 READY/WAIT behavior and adds per-column filtering across Job, route, recipe, next-main and batch fields. Filtered check-all only selects visible rows; Planning mutations still use the canonical Planning API.
import Link from "next/link";
import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {AppTabs} from "@/components/app-tabs";
import {getPool} from "@/lib/db";
import {getAccessContext} from "@/lib/security/access";

export const dynamic="force-dynamic";

const clean=(v:unknown)=>String(v??"").trim();
const nfmt=(v:unknown,max=2)=>{const n=Number(v??0);return Number.isFinite(n)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:max}).format(n):"—";};
const hhmm=(minutes:unknown)=>{if(minutes==null||minutes==="")return "—";const n=Math.max(0,Math.round(Number(minutes)||0));return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`;};
const hours=(v:unknown)=>{if(v==null||v==="")return "—";const n=Number(v);if(!Number.isFinite(n))return "—";return hhmm(n*60);};
const yn=(v:unknown)=>v===true?"Có":"Không";
const val=(v:unknown)=>v===null||v===undefined||v===""?"—":String(v);

type Step={title:string;detail:React.ReactNode;href?:string;action?:string};
function Card({title,children,tone="normal"}:{title:string;children:React.ReactNode;tone?:"normal"|"important"|"warning"}){return <section className={`guide-rule guide-rule-${tone}`}><b>{title}</b><div>{children}</div></section>}
function Module({no,title,goal,steps}:{no:string;title:string;goal:string;steps:Step[]}){return <section className="erp-table-panel guide-section training-module"><div className="erp-panel-head"><div><b>{no} · {title}</b><small className="planning-sub">{goal}</small></div></div><div className="lg-body"><ol className="lg-steps training-steps">{steps.map((s,i)=><li key={`${no}-${i}`}><b>{s.title}</b> — {s.detail}{s.href?<div className="training-action"><Link className="btn small" href={s.href}>Mở màn hình</Link>{s.action?<span>{s.action}</span>:null}</div>:null}</li>)}</ol></div></section>}
function Check({children}:{children:React.ReactNode}){return <li><span className="training-check" aria-hidden="true">✓</span>{children}</li>}
function Badge({children}:{children:React.ReactNode}){return <span className="badge b-ready">{children}</span>}

export default async function Page({searchParams}:{searchParams:Promise<{job?:string}>}){
 const sp=await searchParams;const requestedJob=clean(sp.job);const access=await getAccessContext();const db=await getPool().connect();
 let sampleJob:any=null,chain:any[]=[],mappings:any[]=[],mainOps:any[]=[],recipeSizes:any[]=[],recipes:any[]=[],timeRules:any[]=[],areas:any[]=[],scheduleAreas:any[]=[],batchRows:any[]=[];
 const errors:Record<string,string>={};
 const read=async(key:string,sql:string,args:any[]=[]):Promise<any[]>=>{try{return (await db.query(sql,args)).rows;}catch(e){errors[key]=e instanceof Error?e.message:String(e);return [];}};
 try{
  const sampleRows=await read("sampleJob",requestedJob?`
    select j.job_num,j.part_num,j.revision_num,j.part_description,j.next_operation,j.last_operation,
           j.prod_qty,j.current_good_wip_qty,j.total_surface,j.priority_type,j.is_open
    from open_job_current j where upper(trim(j.job_num))=upper(trim($1)) limit 1
   `:`
    select j.job_num,j.part_num,j.revision_num,j.part_description,j.next_operation,j.last_operation,
           j.prod_qty,j.current_good_wip_qty,j.total_surface,j.priority_type,j.is_open
    from open_job_current j
    where j.is_open=true
    order by case when exists(select 1 from planning_job_operation po where po.job_num=j.job_num and po.is_active=true) then 0 else 1 end,
             coalesce(j.current_good_wip_qty,j.prod_qty,0) desc,j.job_num
    limit 1
   `,requestedJob?[requestedJob]:[]);
  sampleJob=sampleRows[0]||null;
  const jobNum=clean(sampleJob?.job_num);

  [mappings,mainOps,recipeSizes,recipes,timeRules,areas,scheduleAreas]=await Promise.all([
   read("mappings",`select source_operation_code,st_group,standard_operation_rule,sort_order,mapping_rule
     from md_st_operation_mapping where is_active=true order by st_group,sort_order,source_operation_code limit 250`),
   read("mainOps",`select standard_operation,st_group,planning_sort_order,batch_prefix,batch_sequence_start,batch_sequence_padding,
            batch_size_qty,batch_auto_split
     from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   read("recipeSizes",`select s.standard_operation,s.recipe_key,s.batch_size_qty,r.recipe_no,r.recipe_name
     from md_operation_recipe_batch_size s left join md_process_recipe r on r.recipe_key=s.recipe_key
     where s.is_active=true order by s.standard_operation,r.recipe_no nulls last,r.recipe_name`),
   read("recipes",`select r.recipe_key,r.process_family,r.recipe_group,r.recipe_no,r.recipe_name,r.batch_key,
       coalesce(string_agg(distinct m.standard_operation,', ' order by m.standard_operation) filter(where m.standard_operation is not null),'—') main_operations
     from md_process_recipe r
     left join md_main_operation_recipe m on m.recipe_key=r.recipe_key and m.is_active=true
     where r.is_active=true group by r.recipe_key order by r.process_family,r.recipe_no nulls last,r.recipe_name limit 500`),
   read("timeRules",`select t.id,t.recipe_key,t.calc_type,t.priority,t.qty_min,t.qty_max,t.surface_min_dm2,t.surface_max_dm2,
            t.fixed_hours,t.standard_hours,t.note,r.recipe_no,r.recipe_name,r.process_family
     from md_recipe_time_rule t join md_process_recipe r on r.recipe_key=t.recipe_key
     where t.is_active=true and r.is_active=true
     order by r.process_family,r.recipe_no nulls last,t.priority,t.id limit 800`),
   read("areas",`select a.area_code,a.area_name,a.sort_order,
       coalesce(string_agg(g.st_group,', ' order by g.st_group) filter(where g.st_group is not null),'—') st_groups
     from md_area a left join md_area_operation_group g on g.area_id=a.id and g.is_active=true
     where a.is_active=true group by a.id order by a.sort_order,a.area_code`),
   read("scheduleAreas",`select s.schedule_area_code,s.schedule_area_name,s.display_order,
       coalesce(pwa.planner_owner,s.planner_owner,'UNASSIGNED') planner_owner,
       coalesce(string_agg(distinct sao.standard_operation,', ' order by sao.standard_operation) filter(where sao.standard_operation is not null),'—') operations
     from md_schedule_area s
     left join md_planner_work_assignment pwa on pwa.schedule_area_code=s.schedule_area_code and pwa.is_active=true
     left join md_schedule_area_operation sao on sao.schedule_area_code=s.schedule_area_code and sao.is_active=true
     where s.is_active=true
     group by s.schedule_area_code,s.schedule_area_name,s.display_order,pwa.planner_owner,s.planner_owner
     order by s.display_order,s.schedule_area_code`)
  ]);

  if(jobNum){
   chain=await read("chain",`
    select po.id,po.source_seq,po.planning_seq,po.source_operation_code,po.standard_operation,po.st_group,po.recipe_key,
           po.status,po.is_hold,po.hold_reason,
           om.planning_sort_order,om.batch_prefix,om.batch_sequence_start,om.batch_sequence_padding,om.batch_size_qty,om.batch_auto_split,
           pr.recipe_no,pr.recipe_name,pr.process_family,
           a.area_name,
           lane.schedule_area_code,lane.schedule_area_name,lane.planner_owner,
           b.id batch_id,b.batch_no,b.total_qty,b.total_surface_dm2,b.process_minutes,b.status batch_status,
           ps.resource_code,ps.planned_start,ps.planned_end,ps.duration_minutes,ps.status schedule_status
    from planning_job_operation po
    left join md_operation_master om on upper(trim(om.standard_operation))=upper(trim(po.standard_operation)) and om.is_active=true
    left join md_process_recipe pr on pr.recipe_key=po.recipe_key
    left join lateral (
      select ar.area_name from md_area_operation_group g join md_area ar on ar.id=g.area_id and ar.is_active=true
      where g.is_active=true and upper(trim(g.st_group))=upper(trim(po.st_group)) order by ar.sort_order,ar.area_code limit 1
    ) a on true
    left join lateral (
      select sa.schedule_area_code,sa.schedule_area_name,coalesce(pwa.planner_owner,sa.planner_owner,'UNASSIGNED') planner_owner
      from md_schedule_area_operation sao join md_schedule_area sa on sa.schedule_area_code=sao.schedule_area_code and sa.is_active=true
      left join md_planner_work_assignment pwa on pwa.schedule_area_code=sa.schedule_area_code and pwa.is_active=true
      where sao.is_active=true and upper(trim(sao.standard_operation))=upper(trim(po.standard_operation))
      order by sa.display_order,sa.schedule_area_code limit 1
    ) lane on true
    left join lateral (
      select pb.* from planning_batch_job bj join planning_batch pb on pb.id=bj.batch_id and pb.status<>'CANCELLED'
      where bj.planning_job_operation_id=po.id order by pb.created_at desc,pb.id desc limit 1
    ) b on true
    left join lateral (
      select s.* from planning_schedule s where s.batch_id=b.id and s.status<>'CANCELLED'
      order by s.planned_start desc nulls last,s.id desc limit 1
    ) ps on true
    where po.job_num=$1 and po.is_active=true
    order by po.planning_seq,po.source_seq,po.id`,[jobNum]);
   batchRows=await read("batchRows",`select b.batch_no,b.standard_operation,b.recipe_key,b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,b.status,
        bj.qty job_qty,bj.surface_dm2 job_surface
      from planning_batch_job bj join planning_batch b on b.id=bj.batch_id
      where bj.job_num=$1 and b.status<>'CANCELLED' order by b.created_at,b.id`,[jobNum]);
  }
 }finally{db.release();}

 const mapBySource=new Map(mappings.map((x:any)=>[clean(x.source_operation_code).toUpperCase(),x]));
 const opByMain=new Map(mainOps.map((x:any)=>[clean(x.standard_operation).toUpperCase(),x]));
 const recipeByKey=new Map(recipes.map((x:any)=>[clean(x.recipe_key),x]));
 const sizeByMain=new Map<string,any[]>();for(const x of recipeSizes){const k=clean(x.standard_operation).toUpperCase();sizeByMain.set(k,[...(sizeByMain.get(k)||[]),x]);}
 const timeByRecipe=new Map<string,any[]>();for(const x of timeRules){const k=clean(x.recipe_key);timeByRecipe.set(k,[...(timeByRecipe.get(k)||[]),x]);}
 const exampleSource=clean(chain[0]?.source_operation_code||mappings[0]?.source_operation_code);
 const exampleMap=mapBySource.get(exampleSource.toUpperCase())||null;
 const exampleMain=clean(chain[0]?.standard_operation||exampleMap?.standard_operation_rule||mainOps[0]?.standard_operation);
 const exampleOp=opByMain.get(exampleMain.toUpperCase())||null;
 const exampleRecipeKey=clean(chain.find((x:any)=>x.recipe_key)?.recipe_key||recipes.find((x:any)=>clean(x.main_operations).toUpperCase().includes(exampleMain.toUpperCase()))?.recipe_key);
 const exampleRecipe=recipeByKey.get(exampleRecipeKey)||null;
 const exampleTimeRules=timeByRecipe.get(exampleRecipeKey)||[];
 const exampleSizes=sizeByMain.get(exampleMain.toUpperCase())||[];
 const liveOk=Object.keys(errors).length===0;

 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="TRAINING"/><AppTabs active="training"/>
  <section className="erp-content erp-content-full guide-page training-page">
   <div className="erp-page-head guide-head"><div><div className="erp-object-eyebrow">ONBOARDING · LIVE DATABASE · ST PLANNING · V499</div><h2>New User Training — học bằng dữ liệu thật đang chạy</h2><p>Lý thuyết trước, sau đó đối chiếu ngay Operation Code, Main, Area, Planner, Recipe, Batch Rules, Process Time và một Job thật từ database. V499 giữ toàn bộ classifier READY/WAIT, Planning Board Quick View và Internal Chat. Dashboard vẫn dùng bảng workload chính. Trên Scheduling, MAIN TOTAL trở lại chỉ hiển thị tổng; planner click trực tiếp vào các dòng detail tại Recipe row để mở Quick View đã lọc đúng Main + Recipe + bucket, tương tự detail WAIT · Next Main. Các Alert/Audit và Batch/Schedule engine cũ vẫn giữ nguyên.</p></div><div className="erp-command-actions"><Link className="btn" href="/logic-guide">Logic & Hướng dẫn</Link><Link className="btn primary" href="/job-tracker">Mở Job Tracker</Link></div></div>

   <div className="guide-jump"><a href="#theory">1. Lý thuyết</a><a href="#live-config">2. Config thật</a><a href="#op-example">3. Operation Code thật</a><a href="#batch-rules">4. Batch Rules thật</a><a href="#time-rules">5. Process Time thật</a><a href="#job-live">6. Job thật</a><a href="#flow">7. Đi xuyên flow</a><a href="#scenarios">8. Tình huống</a><a href="#security">9. Phân quyền</a><a href="#practice">10. Bài thực hành</a></div>

   <section className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>Trạng thái dữ liệu Training</b><small className="planning-sub">Trang này đọc database mỗi lần mở/reload; không dùng ví dụ hard-code làm nguồn chuẩn.</small></div><span className={`badge ${liveOk?"b-ready":"b-wait"}`}>{liveOk?"LIVE DATA OK":"LIVE DATA PARTIAL"}</span></div><div className="lg-body">
    <form method="get" className="training-live-search"><label><b>Chọn Job thật để học</b><input name="job" defaultValue={requestedJob} placeholder={sampleJob?`Ví dụ: ${sampleJob.job_num}`:"Nhập Job Number"}/></label><button className="btn primary" type="submit">Load Job</button>{requestedJob?<Link className="btn" href="/training">Job mẫu tự động</Link>:null}</form>
    {sampleJob?<p>Job đang dùng làm bài mẫu: <Badge>{sampleJob.job_num}</Badge> · Part <b>{sampleJob.part_num}</b> · Rev <b>{val(sampleJob.revision_num)}</b> · NextOperation <b>{val(sampleJob.next_operation)}</b>. Bạn có thể nhập Job khác ở trên để trainer dạy theo đúng dữ liệu của Job đó.</p>:<Card title="Chưa lấy được Job mẫu" tone="warning">Database chưa trả về Open Job phù hợp. Các bảng config thật bên dưới vẫn dùng được để training.</Card>}
    {Object.keys(errors).length?<details className="erp-details"><summary>Chi tiết nguồn live chưa đọc được ({Object.keys(errors).length})</summary><div className="table-wrap"><table className="erp-table"><tbody>{Object.entries(errors).map(([k,v])=><tr key={k}><td><b>{k}</b></td><td>{v}</td></tr>)}</tbody></table></div></details>:null}
   </div></section>

   <section id="theory" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>1 · Lý thuyết nền — đi từ chung nhất đến chi tiết nhất</b><small className="planning-sub">Người mới phải hiểu quan hệ này trước khi tạo Batch.</small></div></div><div className="lg-body">
    <div className="lg-key lg-key-2">
     <Card title="A. Routing kỹ thuật" tone="important"><b>Job → RAW Operation Code</b>. Operation Code là bước kỹ thuật thật. Nó chưa phải đơn vị planner điều độ.</Card>
     <Card title="B. Planning Mapping"><b>Operation Code → ST Scope → ST Group → Main Operation → Main Planning Order</b>. Đây là cách app biến routing kỹ thuật thành planning chain.</Card>
     <Card title="C. Công nghệ"><b>Main → Recipe → Batch Key → Batch Size → Process Time Rule</b>. Recipe nói chạy gì; Batch Key nói Job nào được đi chung; Size nói lô chứa bao nhiêu; Time Rule nói cần bao lâu.</Card>
     <Card title="D. Vận hành"><b>Job → Batch → Resource → Schedule → Production</b>. Planning nhìn theo Job; Production vận hành theo Batch.</Card>
    </div>
    <p><b>Điểm phải nhớ:</b> Main Planning Order quyết định Previous/Next Main. Không hard-code bằng tên. Planner Owner chỉ là trách nhiệm; dependency vẫn chạy xuyên planner. READY/WAIT là logic planning-chain; Resource/Start/End là feasibility của scheduling. Từ V489, WAIT được đọc thành <b>WAIT · Next Main</b> (Main LOCKED gần nhất) và <b>WAIT · Future Mains</b> (các Main LOCKED còn lại); bên dưới database vẫn là LOCKED. <b>Chỉ cần Previous Main đã Plan/tạo Batch là mở đúng một Next Main READY</b>; Schedule không phải điều kiện mở, Schedule chỉ chuyển READY sang nhóm xanh đậm Scheduled/Done thay vì xanh nhạt not yet Schedule.</p>
   </div></section>

   <section id="live-config" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>2 · Nhìn dữ liệu cấu hình thật trước</b><small className="planning-sub">Trainer mở các bảng này và chỉ cho học viên biết app đang thật sự dùng gì, không học bằng danh sách tưởng tượng.</small></div></div><div className="lg-body">
    <div className="lg-key lg-key-2"><Card title="Main Operation đang active">Database hiện có <b>{mainOps.length}</b> Main Operation active.</Card><Card title="Operation Mapping đang active">Đang đọc <b>{mappings.length}</b> mapping Operation Code → ST Group/Main.</Card><Card title="Recipe đang active">Đang đọc <b>{recipes.length}</b> Process Recipe.</Card><Card title="Process Time Rule đang active">Đang đọc <b>{timeRules.length}</b> rule thời gian.</Card></div>
    <details className="erp-details" open><summary>Main Operation + Batch Config thật ({mainOps.length})</summary><div className="table-wrap"><table className="erp-table"><thead><tr><th>Order</th><th>Main</th><th>ST Group</th><th>Prefix</th><th>Seq Start</th><th>Digits</th><th>Common Size</th><th>Auto Split</th></tr></thead><tbody>{mainOps.map((x:any)=><tr key={x.standard_operation}><td>{val(x.planning_sort_order)}</td><td><b>{x.standard_operation}</b></td><td>{val(x.st_group)}</td><td>{val(x.batch_prefix)}</td><td>{val(x.batch_sequence_start)}</td><td>{val(x.batch_sequence_padding)}</td><td>{val(x.batch_size_qty)}</td><td>{yn(x.batch_auto_split)}</td></tr>)}</tbody></table></div></details>
    <details className="erp-details"><summary>Physical Area thật ({areas.length})</summary><div className="table-wrap"><table className="erp-table"><thead><tr><th>Display Order</th><th>Area</th><th>ST Group</th></tr></thead><tbody>{areas.map((x:any)=><tr key={x.area_code}><td>{x.sort_order}</td><td><b>{x.area_name}</b><div className="muted">{x.area_code}</div></td><td>{x.st_groups}</td></tr>)}</tbody></table></div></details>
    <details className="erp-details"><summary>Schedule Area + Planner thật ({scheduleAreas.length})</summary><div className="table-wrap"><table className="erp-table"><thead><tr><th>Order</th><th>Schedule Area</th><th>Planner</th><th>Main Operations</th></tr></thead><tbody>{scheduleAreas.map((x:any)=><tr key={x.schedule_area_code}><td>{x.display_order}</td><td><b>{x.schedule_area_name}</b><div className="muted">{x.schedule_area_code}</div></td><td>{x.planner_owner}</td><td>{x.operations}</td></tr>)}</tbody></table></div></details>
   </div></section>

   <section id="op-example" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>3 · Operation Code thật → Main thật: đọc một dòng như thế nào?</b><small className="planning-sub">Ví dụ tự lấy từ Job mẫu; nếu Job chưa có chain thì lấy mapping active đầu tiên.</small></div></div><div className="lg-body">
    {exampleSource?<><div className="notice"><b>Operation Code mẫu live:</b> {exampleSource} → ST Group <b>{val(exampleMap?.st_group||chain[0]?.st_group)}</b> → Main <b>{val(exampleMain)}</b> → Main Planning Order <b>{val(exampleOp?.planning_sort_order||chain[0]?.planning_sort_order)}</b>.</div>
    <ol className="lg-steps"><li><b>Operation Code = {exampleSource}</b>: đây là code kỹ thuật xuất phát từ route/job.</li><li><b>ST Group = {val(exampleMap?.st_group||chain[0]?.st_group)}</b>: nhóm logic của code.</li><li><b>Main = {val(exampleMain)}</b>: đơn vị mà Planning Board tạo Batch.</li><li><b>Planning Order = {val(exampleOp?.planning_sort_order||chain[0]?.planning_sort_order)}</b>: dùng để xếp chain Previous/Current/Next Main.</li><li><b>Batch Prefix = {val(exampleOp?.batch_prefix||chain[0]?.batch_prefix)}</b>: Batch No dùng prefix này + sequence, không chèn ngày.</li></ol></>:<Card title="Chưa có Operation Code mẫu" tone="warning">Không lấy được mapping live. Kiểm tra ST Operation Mapping.</Card>}
    <details className="erp-details"><summary>Operation Mapping thật ({mappings.length} dòng đã load)</summary><div className="table-wrap"><table className="erp-table"><thead><tr><th>Operation Code</th><th>ST Group</th><th>Main Rule</th><th>Order trong mapping</th><th>Rule</th></tr></thead><tbody>{mappings.slice(0,100).map((x:any,i)=><tr key={`${x.source_operation_code}-${i}`}><td><b>{x.source_operation_code}</b></td><td>{x.st_group}</td><td>{val(x.standard_operation_rule)}</td><td>{x.sort_order}</td><td>{val(x.mapping_rule)}</td></tr>)}</tbody></table></div></details>
   </div></section>

   <section id="batch-rules" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>4 · Batch Rules thật — đọc từ Main Operation</b><small className="planning-sub">Người mới phải nhìn config thật để hiểu tại sao Batch No/Size/Split ra kết quả hiện tại.</small></div></div><div className="lg-body">
    {exampleOp?<><div className="lg-key lg-key-2"><Card title={`${exampleMain} · Batch Number`}><b>Prefix {val(exampleOp.batch_prefix)}</b> · Sequence Start {val(exampleOp.batch_sequence_start)} · Padding {val(exampleOp.batch_sequence_padding)}. Ví dụ số kế tiếp được cấp theo sequence toàn cục của prefix.</Card><Card title={`${exampleMain} · Batch Size`}><b>Common Size: {val(exampleOp.batch_size_qty)}</b> · Auto Split: <b>{yn(exampleOp.batch_auto_split)}</b>. Recipe-specific size nếu có sẽ ưu tiên hơn Common Size.</Card></div>
    {exampleSizes.length?<div className="table-wrap"><table className="erp-table"><thead><tr><th>Main</th><th>Recipe</th><th>Recipe Name</th><th>Recipe Batch Size</th><th>Ưu tiên</th></tr></thead><tbody>{exampleSizes.map((x:any)=><tr key={`${x.standard_operation}-${x.recipe_key}`}><td>{x.standard_operation}</td><td>{x.recipe_no||x.recipe_key}</td><td>{val(x.recipe_name)}</td><td><b>{x.batch_size_qty}</b></td><td>Recipe-specific → thắng Common</td></tr>)}</tbody></table></div>:<p className="muted">Main {exampleMain} hiện không có Recipe-specific Batch Size; nếu Common Size có giá trị thì dùng Common, nếu cả hai trống thì không auto split theo size.</p>}</>:null}
    <details className="erp-details"><summary>Tất cả Recipe-specific Batch Size đang active ({recipeSizes.length})</summary><div className="table-wrap"><table className="erp-table"><thead><tr><th>Main</th><th>Recipe</th><th>Tên</th><th>Batch Size</th></tr></thead><tbody>{recipeSizes.map((x:any)=><tr key={`${x.standard_operation}-${x.recipe_key}`}><td><b>{x.standard_operation}</b></td><td>{x.recipe_no||x.recipe_key}</td><td>{val(x.recipe_name)}</td><td>{x.batch_size_qty}</td></tr>)}</tbody></table></div></details>
   </div></section>

   <section id="time-rules" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>5 · Recipe + Process Time Rule thật</b><small className="planning-sub">Giải thích từ Recipe đang resolve đến rule thời gian; Fixed khác Qty/Surface.</small></div></div><div className="lg-body">
    {exampleRecipe?<><div className="notice"><b>Recipe mẫu live:</b> {val(exampleRecipe.recipe_no)} · {val(exampleRecipe.recipe_name)} · Family {val(exampleRecipe.process_family)} · Main {val(exampleRecipe.main_operations)}.</div>
    {exampleTimeRules.length?<div className="table-wrap"><table className="erp-table"><thead><tr><th>Priority</th><th>Calc Type</th><th>Qty Min→Max</th><th>Surface Min→Max</th><th>Fixed</th><th>Standard</th><th>Note</th></tr></thead><tbody>{exampleTimeRules.map((x:any)=><tr key={x.id}><td>{x.priority}</td><td><b>{x.calc_type}</b></td><td>{val(x.qty_min)} → {val(x.qty_max)}</td><td>{val(x.surface_min_dm2)} → {val(x.surface_max_dm2)}</td><td>{hours(x.fixed_hours)}</td><td>{hours(x.standard_hours)}</td><td>{val(x.note)}</td></tr>)}</tbody></table></div>:<Card title="Recipe chưa có Process Time Rule" tone="warning">Recipe {val(exampleRecipe.recipe_no||exampleRecipe.recipe_key)} đang không trả về rule active trong bảng md_recipe_time_rule.</Card>}</>:<p className="muted">Job/Main mẫu chưa resolve được Recipe; mở Recipe Mapping để kiểm tra.</p>}
    <Module no="5A" title="Cách đọc Time Rule" goal="Không học thuộc số giờ; học cách engine chọn rule." steps={[
      {title:"Recipe trước",detail:"Engine phải biết Recipe của Batch trước khi chọn Process Time Rule."},
      {title:"Priority",detail:"Trong cùng Recipe, rule được xét theo Priority/điều kiện hiện hành."},
      {title:"Qty + Surface",detail:"Qty và tổng Surface của chính Batch được so với Min/Max. Min/Max trống nghĩa là không giới hạn phía đó."},
      {title:"Fixed vs Standard",detail:"Fixed dùng thời gian cố định; rule theo Qty/Surface dùng mức cấu hình tương ứng. Khi Job được thêm/bớt hoặc Recipe đổi, Process Time Batch phải được tính lại."},
      {title:"Scheduling Override",detail:"Planner có thể chỉnh duration ở lịch theo flow hiện hành; override đó không sửa Master Time Rule."}
    ]}/>
   </div></section>

   <section id="job-live" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>6 · Một Job thật đi qua hệ thống</b><small className="planning-sub">Đây là phần trainer nên dùng nhiều nhất: học viên nhìn cùng một Job từ raw state đến Main/Batch/Schedule.</small></div></div><div className="lg-body">
    {sampleJob?<><div className="part-summary-grid compact"><div className="kv"><span>Job</span><b>{sampleJob.job_num}</b></div><div className="kv"><span>Part / Rev</span><b>{sampleJob.part_num} / {val(sampleJob.revision_num)}</b></div><div className="kv"><span>NextOperation</span><b>{val(sampleJob.next_operation)}</b></div><div className="kv"><span>LastOperation</span><b>{val(sampleJob.last_operation)}</b></div><div className="kv"><span>Good WIP / Prod Qty</span><b>{nfmt(sampleJob.current_good_wip_qty)} / {nfmt(sampleJob.prod_qty)}</b></div><div className="kv"><span>Total Surface</span><b>{nfmt(sampleJob.total_surface)} dm²</b></div></div>
    {chain.length?<div className="table-wrap"><table className="erp-table"><thead><tr><th>#</th><th>RAW Operation</th><th>Main</th><th>ST Group</th><th>Area / Planner</th><th>Recipe</th><th>Batch Rule</th><th>Batch/Schedule hiện tại</th></tr></thead><tbody>{chain.map((x:any,i)=>{const sizes=sizeByMain.get(clean(x.standard_operation).toUpperCase())||[];return <tr key={x.id}><td>{i+1}<div className="muted">PSeq {val(x.planning_seq)}</div></td><td><b>{x.source_operation_code}</b><div className="muted">Source Seq {val(x.source_seq)}</div></td><td><b>{x.standard_operation}</b><div className="muted">Order {val(x.planning_sort_order)}</div></td><td>{val(x.st_group)}</td><td>{val(x.area_name)}<div className="muted">{val(x.schedule_area_name)} · {val(x.planner_owner)}</div></td><td>{x.recipe_no||"—"}<div className="muted">{val(x.recipe_name)}</div></td><td>{val(x.batch_prefix)} · Common {val(x.batch_size_qty)} · Split {yn(x.batch_auto_split)}{sizes.length?<div className="muted">{sizes.length} recipe override</div>:null}</td><td>{x.batch_no?<><b>{x.batch_no}</b><div className="muted">{val(x.resource_code)} · {val(x.schedule_status||x.batch_status)}</div></>:<span className="badge b-wait">Chưa có Batch</span>}</td></tr>})}</tbody></table></div>:<Card title="Job chưa có Planning Chain" tone="warning">Job {sampleJob.job_num} hiện chưa có planning_job_operation active. Đây cũng là tình huống training: kiểm tra raw NextOperation → Mapping → sync planning chain.</Card>}
    <div className="training-action"><Link className="btn primary" href={`/job-tracker?q=${encodeURIComponent(sampleJob.job_num)}`}>Mở chính Job này trong Job Tracker</Link></div></>:<div className="erp-empty">Không có Job live để hiển thị.</div>}
   </div></section>

   <section id="flow" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>7 · Trainer dẫn học viên đi xuyên flow — từng câu hỏi phải trả lời</b></div></div><div className="lg-body"><ol className="lg-steps">
    <li><b>All Open Jobs:</b> Job hiện có NextOperation gì? Qty/Surface/Priority là bao nhiêu? Đây là dữ liệu nguồn, chưa phải quyết định Batch.</li>
    <li><b>Operation Mapping:</b> Next/route Operation Code map vào ST Group và Main nào? Nếu không map được, dừng tại đây và sửa cấu hình nguồn đúng chỗ.</li>
    <li><b>Main Chain:</b> Main hiện tại đứng thứ mấy? Previous Main/Next Main là gì theo Planning Order thật của Job?</li>
    <li><b>Recipe:</b> Main này resolve Recipe nào? Recipe lấy theo rule/cột dữ liệu nào? Có mismatch với Batch định gom không?</li>
    <li><b>Batch Rules:</b> Prefix gì? Common Size bao nhiêu? Có Recipe-specific Size không? Auto Split bật không? Nếu Job 24 pcs và size 12 thì vì sao tạo 2 batch?</li>
    <li><b>Process Time:</b> Recipe hiện có rule nào match Qty/Surface của từng Batch? Tại sao split làm thời gian phải tính riêng từng lô?</li>
    <li><b>Planning Board:</b> Job READY, WAIT · Next Main hay WAIT · Future Mains? Từ V493 có thể click card Workload ngay tại Scheduling để mở <b>Planning Board Quick View</b>. READY cho phép chọn Job và Add/Create Batch qua chính Batch engine của Planning Board; WAIT/HOLD chỉ xem. Popup hiển thị cả <b>Next Main + Next Recipe No/Name</b> và có <b>filter theo từng cột</b> để tìm nhanh Job/Part/Priority/Recipe/Next Main/Batch. WAIT · Next Main là blocker gần nhất sau frontier; WAIT · Future Mains là các Main xa hơn. Nếu cùng Job/Main nhiều batch thì Planning Board hiển thị nối bằng &.</li>
    <li><b>Dashboard Workload:</b> từ V496 không còn KPI card. Đối chiếu trực tiếp <b>ST Workload Summary · By Area</b> với Planning Board: thứ tự WAIT/READY/Planned/Scheduled/Hold/ST Only/Total và màu bucket phải giống nhau; số liệu vẫn từ cùng canonical workload population.</li>
    <li><b>Recent Batches:</b> từ V494, dùng nút <b>Xuất Excel</b> cạnh Delete để lấy đúng Job membership của một Batch. Kiểm tra file phải có Qty/Surface allocation của Batch, Operation Code, Previous Operation, Next Main, Recipe, Primer 1/2/3, Priority, Status và Batch No.; thao tác export không sửa dữ liệu.</li>
    <li><b>Internal Chat V510:</b> mở tab Chat, kiểm tra badge unread, gửi Group message và chọn một active user để gửi Direct Message. Sau đó tạo/thêm Batch, Add/Remove Job hoặc thay đổi Schedule ở Main test và kiểm tra SYSTEM message xuất hiện tự động không F5. Nếu downstream thuộc Planner khác, message phải có nhãn <b>CROSS-PLANNER</b> và hiển thị Planner nguồn → Planner bị ảnh hưởng. Chat chỉ thông báo; thao tác nghiệp vụ vẫn phải thực hiện ở Planning/Scheduling/Production.</li>
    <li><b>Scheduling:</b> Chọn Resource/Start/Duration. Start Current Main phải phù hợp Effective End Previous Main và resource constraints.</li>
    <li><b>Production:</b> Báo actual. Khi cần thêm Job ngoài lô, bấm <b>Add Job</b> cạnh Batch No., nhập Job Number rồi Save. Job được audit và hệ thống tạo Attention cho <b>tất cả Main Planning phía sau</b> theo route thật; mỗi Attention phải đọc được Recipe của Main đích. <b>V487:</b> RAW NextOperation có thể vẫn ở bộ phận khác; nếu Target Main nằm trong future ST routing thì hệ thống tự sync riêng Job và vẫn cho thêm. Nếu Main có Masking/Unmasking, Job tự xuất hiện ngay ở Preparation report với trạng thái WAITING. <b>V488:</b> thêm Job tiếp theo không được làm mất Job đã thêm trước; khu vực <i>Jobs added during production</i> luôn hiển thị đầy đủ danh sách cộng dồn của Batch.</li>
    <li><b>Đầu ngày:</b> trước 05:59 nếu còn Batch chưa hoàn tất, Carry Over được preview; chỉ khi duyệt mới cascade lịch xuyên resource và planner.</li><li><b>Quét lại sau khi sửa báo cáo:</b> mỗi lần Scan đọc trạng thái Production mới nhất. Nếu Batch từng bị báo thiếu nhưng sau đó Operator cập nhật DONE, Scan lại phải xóa Carry Over/Bớt Job còn PENDING của Batch đó; lịch sử đã duyệt/từ chối vẫn giữ để audit.</li>
   </ol></div></section>

   <section id="scenarios" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>8 · Tất cả tình huống trainer phải đưa ra</b><small className="planning-sub">Không chỉ học happy path; phải biết vì sao sai và kiểm tra ở đâu.</small></div></div><div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Tình huống</th><th>Người mới phải hiểu</th><th>Cách xử lý đúng</th></tr></thead><tbody>
    <tr><td>Operation Code chưa map</td><td>Không thể suy Main bằng tên.</td><td>Kiểm tra ST Scope + ST Operation Mapping.</td></tr>
    <tr><td>ST_SCOPE_ONLY</td><td>Theo dõi được nhưng không tham gia Planning Chain/Batch/Board.</td><td>Không ép đưa vào Batch.</td></tr>
    <tr><td>Job WAIT · Next Main</td><td>Đây là Main LOCKED gần nhất trong active chain, đang chờ handoff từ frontier trước đó.</td><td>Đọc Job Tracker/Route Matrix; không sửa Master để ép READY.</td></tr>
    <tr><td>Job WAIT · Future Mains</td><td>Đây là Main LOCKED xa hơn; trước nó còn ít nhất một Main chưa tới lượt.</td><td>Không plan vượt chuỗi. Chờ Main gần hơn được handoff rồi classifier sẽ tự dịch chuyển Next/Future.</td></tr>
    <tr><td>Previous Main DONE nhưng dữ liệu cũ không có Batch</td><td>Physical progress vẫn có thể đủ handoff. Workload Summary và danh sách drill-down phải dùng cùng một classifier.</td><td>READY · chính trước Scheduled / Done. Khi bấm KPI này, Job vẫn phải hiện trong Candidate list dù Previous Main không có Batch/Schedule lịch sử.</td></tr>
    <tr><td>Main Planning đầu tiên trong chuỗi</td><td>Không có Previous Main nên không có dependency upstream để chờ. Khi Main đầu tiên đã READY, nó thuộc nhóm handoff hợp lệ ngay từ START.</td><td>Từ V476 phải nằm ở READY · chính trước Scheduled / Done, không nằm ở READY · chính trước chưa Scheduled / START.</td></tr>
    <tr><td>Đọc Workload Summary trên Dashboard</td><td>Dashboard và Planning Board phải dùng cùng classifier, thứ tự cột và màu bucket.</td><td>V496 bỏ toàn bộ KPI card. Đọc bảng theo thứ tự Planning Board: <b>WAIT Next → WAIT Future → READY Scheduled → READY Unscheduled/START → PLANNED-UNSCHEDULED → SCHEDULED → HOLD → ST ONLY → Total</b>. Việc bỏ card không thay số liệu.</td></tr>
    <tr><td>Đọc Workload Summary trên Scheduling Board</td><td>Scheduling dùng cùng số liệu canonical nhưng trình bày để planner đọc handoff trước.</td><td>Đọc từ trái qua phải: <b>READY Scheduled/Done → READY not yet Schedule → WAIT Next Main → WAIT Future Mains → HOLD</b>. Scheduling Workload không hiển thị PLANNED-UNSCHEDULED, SCHEDULED hay Total. Hai READY dùng card xanh lá đậm/nhạt. <b>V496:</b> tại từng <b>Recipe row</b>, mở breakdown dưới hai READY để xem <b>Previous Main + Previous Recipe No + Job + pcs + dm²</b>; MAIN TOTAL không breakdown. WAIT Next Main vẫn breakdown Previous Main ở mọi khu vực, kể cả Chemical Line.</td></tr>
    <tr><td>Planner 1 thay đổi làm ảnh hưởng Planner 2</td><td>Dependency chạy xuyên Planner; Planner Owner không được cắt Planning Chain.</td><td>Kiểm tra Alert nghiệp vụ như cũ và kiểm tra thêm Internal Chat SYSTEM message có nhãn <b>CROSS-PLANNER</b>. Chiều Planner 2 → Planner 1 phải hoạt động y hệt theo mapping động.</td></tr>
    <tr><td>Future ST Job được Production thêm sớm</td><td>Phân biệt RAW NextOperation hiện tại với future ST routing. Không kết luận “Job không có Main” chỉ vì Job chưa tới ST tại thời điểm import.</td><td>Nhập một Job đang ở bộ phận trước, kiểm tra AllOperation có Target Main; Add vào Batch → hệ thống sync riêng Job, giữ RAW không đổi, auto tạo Preparation WAITING nếu có Masking/Unmasking và tạo Attention cho toàn bộ downstream Main.</td></tr>
    <tr><td>Thêm nhiều Job phát sinh vào cùng Batch</td><td>Production-added là lịch sử cộng dồn theo Batch + Job, không phải “Job mới nhất”.</td><td>Add Job A → kiểm tra A còn hiển thị; Add Job B → phải thấy A + B; Add Job C → phải thấy A + B + C. Refresh trang vẫn phải giữ đủ danh sách nếu các Job còn trong Batch.</td></tr>
    <tr><td>Recipe mismatch</td><td>Batch và Job khác công nghệ.</td><td>Không đổi Recipe Batch chỉ để nhét Job vào.</td></tr>
    <tr><td>Common Batch Size trống</td><td>Có thể vẫn split nếu Recipe-specific Size tồn tại.</td><td>Recipe override thắng Common.</td></tr>
    <tr><td>Cả Common và Recipe Size trống</td><td>Không có size rule.</td><td>Không auto split theo size.</td></tr>
    <tr><td>Job 24, size 12</td><td>Một Job Operation có thể allocation sang nhiều Batch.</td><td>12 + 12; Planning vẫn một Job row.</td></tr>
    <tr><td>Process Time sau split</td><td>Không dùng thời gian của tổng 24 cho từng lô.</td><td>Tính riêng theo Qty/Surface từng Batch.</td></tr>
    <tr><td>Resource overlap</td><td>Planning READY không có nghĩa lịch khả thi.</td><td>Scheduling engine/resource constraint quyết định.</td></tr>
    <tr><td>Chemical Line</td><td>Loading → Process → NDT → Unloading; Flybar/NDT có rule riêng.</td><td>Không cộng duration tổng đơn giản khi có constraint đặc thù.</td></tr>
    <tr><td>Production add Job ngoài Batch</td><td>Thực tế đã thay đổi membership.</td><td>Add trực tiếp + audit; không cần Daily Adjustment approve.</td></tr>
    <tr><td>Production-added Job reload</td><td>Membership phải persist từ planning_batch_job.</td><td>Job vẫn hiện sau reload/đổi tab/tạo Batch mới.</td></tr>
    <tr><td>Production add ở Main trước</td><td>Tất cả Main phía sau phải lấy từ route thật, không dừng ở một hop.</td><td>Tạo Attention cho toàn bộ downstream Main; mỗi dòng hiển thị Main đích + Recipe No./Name. Không hard-code BSA→PRIMER.</td></tr>
    <tr><td>Một downstream Main chưa có Batch</td><td>Route vẫn có Main đó nhưng chưa có Batch đích để nhận Job.</td><td>Giữ event ở trạng thái chờ Batch; các downstream Main khác đã có Batch vẫn nhận Attention bình thường.</td></tr>
    <tr><td>Shot Peening End 07:00→09:00</td><td>Main sau của planner khác không thể giữ Start 07:30.</td><td>Cross-Main Dependency + Resource Cascade trong preview đầu ngày.</td></tr>
    <tr><td>Masking/Unmasking</td><td>Support config theo Main là strict khi đã cấu hình.</td><td>Preparation report tách PRIMER/PRIMER2/PRIMER3/TOPCOAT1/TOPCOAT2/ANTI-ABRASION.</td></tr>
   </tbody></table></div></div></section>


   <section id="security" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>9 · Ai được làm gì — Aiven Login/RBAC, học bằng quyền thật của account đang đăng nhập</b><small className="planning-sub">Người mới phải hiểu Role, Permission và Scope trước khi thao tác dữ liệu thật.</small></div></div><div className="lg-body">
    <div className="lg-key lg-key-2"><Card title="Account hiện tại" tone="important"><b>{access?.displayName||access?.email||"—"}</b><div className="muted">{access?.email||"—"}</div></Card><Card title="Role hiện tại">{access?.roles?.length?access.roles.map(r=><span key={r} className="badge b-ready" style={{marginRight:4}}>{r}</span>):"Chưa có Role"}</Card><Card title="Permission đang có">{access?.permissions?.size||0} permission</Card><Card title="Scope đang có"><div>Planning Main: {access?.scopes.PLANNING_MAIN.size||0}</div><div>Schedule Area: {access?.scopes.SCHEDULE_AREA.size||0}</div><div>Production Area: {access?.scopes.PRODUCTION_AREA.size||0}</div></Card></div>
    <div className="table-wrap"><table className="erp-table"><thead><tr><th>Role</th><th>Được làm gì</th><th>Không được làm gì nếu thiếu quyền</th></tr></thead><tbody>
     <tr><td><b>ADMIN</b></td><td>Toàn quyền, tạo account, gán Role/Permission/Scope; đọc/gửi Internal Chat</td><td>—</td></tr>
     <tr><td><b>PLANNER</b></td><td>Tạo/sửa Batch và Điều độ trong Main/Area được giao; đọc/gửi Internal Chat</td><td>Không được sửa Main hoặc Schedule Area ngoài Scope</td></tr>
     <tr><td><b>PRODUCTION_OPERATOR</b></td><td>Báo trạng thái, Actual, Note trong Production Area được giao; đọc/gửi Internal Chat</td><td>Không được Add Job ngoài lô</td></tr>
     <tr><td><b>SHIFT_SUPERVISOR</b></td><td>Operator + Add Job ngoài lô + nhận Next Main Attention; đọc/gửi Internal Chat</td><td>Không được sửa Planning/Schedule nếu không có permission riêng</td></tr>
    </tbody></table></div>
    <ol className="lg-steps"><li>Trainer mở menu và yêu cầu học viên giải thích vì sao chỉ một số tab xuất hiện.</li><li>Vào Production bằng Operator: chứng minh có thể Report nhưng không thấy ô Add Job.</li><li>Đổi sang Shift Supervisor: chứng minh Add Job xuất hiện và vẫn bị giới hạn theo Production Area Scope.</li><li>Đăng nhập Planner: thử mở Main ngoài Planning Scope hoặc Schedule Area ngoài Scope và giải thích lỗi 403.</li><li>Admin vào Users & Permissions, tạo account test trực tiếp trên Aiven, đặt mật khẩu tạm, gán Role + Permission + Scope rồi đăng nhập thử bằng account đó.</li></ol>
    <Card title="Quy tắc an toàn" tone="warning">Ẩn nút trên giao diện không phải là bảo mật. Học viên phải hiểu session được xác thực từ Aiven và API cũng kiểm tra Permission/Scope; không được dùng URL/API trực tiếp để vượt quyền.</Card>
   </div></section>

   <section id="practice" className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>10 · Bài thực hành bắt buộc trước khi dùng app thật</b></div></div><div className="lg-body"><ol className="lg-steps">
    <li><b>Trace Job live:</b> dùng Job đang hiển thị phía trên, tự nói thành lời: RAW code → ST Group → Main → Area/Planner → Recipe → Batch Rule → Time Rule → Previous/Next Main.</li>
    <li><b>So sánh 2 Main:</b> chọn một Main có Common Batch Size và một Main có Recipe-specific Size; giải thích precedence.</li>
    <li><b>Tính tay Process Time:</b> chọn một Recipe có rule Qty/Surface, lấy Qty/Surface của Batch thật và chỉ ra rule nào match.</li>
    <li><b>Plan thử:</b> tạo Batch đúng Recipe, giải thích Batch No và Auto Split trước khi bấm Save.</li>
    <li><b>Schedule thử:</b> chứng minh Start không vi phạm Previous Main Effective End và resource.</li>
    <li><b>Production exception:</b> thêm một Job test ngoài lô, kiểm tra persistence, Production Change Alert và Next Main Attention.</li>
    <li><b>Carry Over:</b> giả lập End previous Main từ 07:00 → 09:00 và liệt kê tất cả schedule bị ảnh hưởng trước khi duyệt.</li>
   </ol><ul className="training-checklist"><Check>Giải thích được dữ liệu live, không chỉ đọc thuộc tài liệu.</Check><Check>Biết tìm nguồn sai trước khi sửa.</Check><Check>Phân biệt Recipe / Batch Key / Batch Size / Time Rule.</Check><Check>Hiểu Planning Chain khác Scheduling feasibility.</Check><Check>Hiểu Production thay đổi downstream như thế nào.</Check></ul></div></section>

   {batchRows.length?<section className="erp-table-panel guide-section"><div className="erp-panel-head"><div><b>Phụ lục · Batch thật của Job mẫu</b><small className="planning-sub">Dùng để giải thích allocation thực tế của cùng Job qua các Main/Batch.</small></div></div><div className="lg-body"><div className="table-wrap"><table className="erp-table"><thead><tr><th>Batch</th><th>Main</th><th>Job Qty</th><th>Job Surface</th><th>Batch Jobs</th><th>Batch Qty</th><th>Batch Surface</th><th>Process</th><th>Status</th></tr></thead><tbody>{batchRows.map((x:any,i)=><tr key={`${x.batch_no}-${i}`}><td><b>{x.batch_no}</b></td><td>{x.standard_operation}</td><td>{nfmt(x.job_qty)}</td><td>{nfmt(x.job_surface)}</td><td>{x.total_jobs}</td><td>{nfmt(x.total_qty)}</td><td>{nfmt(x.total_surface_dm2)}</td><td>{hhmm(x.process_minutes)}</td><td>{x.status}</td></tr>)}</tbody></table></div></div></section>:null}
  </section>
 </main>
}
