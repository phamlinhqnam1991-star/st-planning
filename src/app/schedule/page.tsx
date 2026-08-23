import {getPool} from "@/lib/db";
import {AppTabs} from "@/components/app-tabs";
import ScheduleBoardClient from "@/components/schedule-board-client";

export const dynamic="force-dynamic";

function fmt(v:any){
 const n=Number(v||0);return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n)
}
function hhmm(v:any){
 const n=Number(v||0);if(!n)return "—";
 return `${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`
}
function time(v:any){
 if(!v)return "—";
 return new Date(v).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"})
}

export default async function Page({searchParams}:{searchParams:Promise<{date?:string}>}){
 const sp=await searchParams;
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"});
 const date=sp.date||today;
 const c=await getPool().connect();
 try{
  const [resourcesQ,batchesQ,scheduleTableQ,timelineQ]=await Promise.all([
   c.query(`select * from md_schedule_resource where is_active=true order by sort_order,resource_code`),
   c.query(`
    select
      b.id,b.batch_no,b.standard_operation,b.recipe_key,
      r.recipe_no,r.recipe_name,
      b.total_jobs,b.total_qty,b.total_surface_dm2,b.process_minutes,
      sch.schedule_id,
      sch.schedule_date,
      sch.resource_code scheduled_resource_code,
      sch.planned_start scheduled_planned_start,
      sch.planned_end scheduled_planned_end,
      sch.schedule_status
    from planning_batch b
    left join md_process_recipe r
      on r.recipe_key=b.recipe_key
     and r.is_active=true

    left join lateral (
      select
        s.id schedule_id,
        s.schedule_date,
        s.resource_code,
        s.planned_start,
        s.planned_end,
        s.status schedule_status
      from planning_schedule s
      where s.batch_id=b.id
        and s.status<>'CANCELLED'
      order by s.planned_start desc,s.id desc
      limit 1
    ) sch on true

    where b.status<>'CANCELLED'

    order by
      case when sch.schedule_id is null then 0 else 1 end,
      b.created_at,
      b.id
   `),

   // Schedule Table: show EVERY active schedule assigned to the selected calendar date.
   c.query(`
    select
      s.*,
      coalesce(b.batch_no,'PB-'||lpad(s.batch_id::text,6,'0')) batch_no,
      b.standard_operation,b.recipe_key,
      pr.recipe_no,pr.recipe_name,
      coalesce(b.total_jobs,0) total_jobs,
      coalesce(b.total_qty,0) total_qty,
      coalesce(b.total_surface_dm2,0) total_surface_dm2,
      coalesce(sr.resource_name,s.resource_code) resource_name,
      coalesce(sr.resource_group,'UNMAPPED') resource_group,
      coalesce(sr.sort_order,9999) resource_sort_order
    from planning_schedule s
    left join planning_batch b
      on b.id=s.batch_id
    left join md_process_recipe pr
      on pr.recipe_key=b.recipe_key
     and pr.is_active=true
    left join md_schedule_resource sr
      on sr.resource_code=s.resource_code
    where s.status<>'CANCELLED'
      and (
        s.schedule_date=$1::date
        or (s.planned_start at time zone 'Asia/Ho_Chi_Minh')::date=$1::date
      )
    order by
      coalesce(sr.sort_order,9999),
      coalesce(b.standard_operation,''),
      s.planned_start,
      coalesce(b.batch_no,'PB-'||lpad(s.batch_id::text,6,'0'))
   `,[date]),

   // Timeline: production day remains 06:00 selected date -> 06:00 next day.
   c.query(`
    select
      s.*,
      coalesce(b.batch_no,'PB-'||lpad(s.batch_id::text,6,'0')) batch_no,
      b.standard_operation,b.recipe_key,
      pr.recipe_no,pr.recipe_name,
      coalesce(b.total_jobs,0) total_jobs,
      coalesce(b.total_qty,0) total_qty,
      coalesce(b.total_surface_dm2,0) total_surface_dm2,
      coalesce(sr.resource_name,s.resource_code) resource_name,
      coalesce(sr.resource_group,'UNMAPPED') resource_group,
      coalesce(sr.sort_order,9999) resource_sort_order
    from planning_schedule s
    left join planning_batch b
      on b.id=s.batch_id
    left join md_process_recipe pr
      on pr.recipe_key=b.recipe_key
     and pr.is_active=true
    left join md_schedule_resource sr
      on sr.resource_code=s.resource_code
    where s.status<>'CANCELLED'
      and s.planned_start < (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
      and s.planned_end   > (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
    order by
      coalesce(sr.sort_order,9999),
      s.planned_start,
      coalesce(b.batch_no,'PB-'||lpad(s.batch_id::text,6,'0'))
   `,[date])
  ]);

  const rows=scheduleTableQ.rows;
  const timelineRows=timelineQ.rows;

  // Unified production timeline order.
  // Resource order is for Board visualization only; the exact Standard Operation
  // remains attached to each scheduled Batch, so different Job routings are not altered.
  const timelineResourceOrder=[
   "SPX-CLEAN",
   "MANUAL-DBL",
   "AUTO-DBL",
   "PLATING",
   "HE-BAKE",
   "PASS-BRTG",
   "MANUALSP",
   "AUTOSHP",
   "FB-01","FB-02","FB-03","FB-04","FB-05","FB-06",
   "CAB1","CAB2","CAB3","CAB4",
   "PAINT-POWDER"
  ];

  const resourceByCode=new Map(
   (resourcesQ.rows as any[]).map((r:any)=>[String(r.resource_code),r])
  );

  const productionResources=timelineResourceOrder
   .map(code=>resourceByCode.get(code))
   .filter(Boolean) as any[];

  // Future resources not explicitly ordered are appended instead of disappearing.
  for(const r of resourcesQ.rows as any[]){
   if(!timelineResourceOrder.includes(String(r.resource_code)))
    productionResources.push(r);
  }

  // Production-day timeline = 06:00 selected date -> 06:00 next day.
  const timelineStart=new Date(`${date}T06:00:00+07:00`);
  const timelineEnd=new Date(timelineStart.getTime()+24*60*60*1000);
  const timelineStartMs=timelineStart.getTime();
  const timelineEndMs=timelineEnd.getTime();
  const timelineSpanMs=timelineEndMs-timelineStartMs;
  const timelineHours=Array.from({length:25},(_,i)=>(6+i)%24);

  const timelineStyle=(startValue:any,endValue:any)=>{
   const rawStart=new Date(startValue).getTime();
   const rawEnd=new Date(endValue).getTime();

   const clippedStart=Math.max(rawStart,timelineStartMs);
   const clippedEnd=Math.min(rawEnd,timelineEndMs);

   if(
    !Number.isFinite(clippedStart) ||
    !Number.isFinite(clippedEnd) ||
    clippedEnd<=clippedStart
   )return null;

   const left=((clippedStart-timelineStartMs)/timelineSpanMs)*100;
   const width=((clippedEnd-clippedStart)/timelineSpanMs)*100;

   return {
    left:`${left}%`,
    width:`${Math.max(width,0.35)}%`
   };
  };

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1><p>Production Planning & Scheduling</p></div>
    <span className="erp-env">SCHEDULING</span>
   </header>
   <AppTabs active="schedule"/>
   <section className="erp-content erp-content-full">
    <div className="erp-page-head">
     <div><h2>Board Điều Độ</h2><p>Batch scheduling theo resource và process time.</p></div>
     <form>
      <input className="input" type="date" name="date" defaultValue={date}/>
      <button className="btn" type="submit">Load</button>
     </form>
    </div>

    <div className="schedule-rule-strip">
     <b>Chemical Line</b>
     <span>6 Flybars</span><span>Max 3 running simultaneously</span><span>Launch interval 01:00</span>
     <b>Painting</b><span>CAB1</span><span>CAB2</span><span>CAB3</span><span>CAB4</span>
    </div>

    <ScheduleBoardClient batches={batchesQ.rows as any} resources={resourcesQ.rows as any} date={date}/>

    <div className="erp-table-panel section">
     <div className="erp-panel-head"><b>Schedule Table</b><span>{rows.length} scheduled batches</span></div>
     <div className="table-wrap">
      <table className="erp-table schedule-table">
       <thead><tr>
        <th>SPX<br/>Clean</th><th>Manual<br/>DBL</th><th>Auto<br/>DBL</th><th>Plating</th><th>He-Bake</th>
        <th>Passivation/<br/>Brightening</th><th>Batch#<br/>ManualSP</th><th>Batch#<br/>AutoSHP</th>
        <th>Chemical line<br/>Flybar#</th><th>Painting<br/>Batch# CAB1</th><th>Painting<br/>Batch# CAB2</th>
        <th>Painting<br/>Batch# CAB3</th><th>Painting<br/>Batch# CAB4</th>
        <th>Painting<br/>Paint Powder</th><th>SP#/FB#/PB#</th>
        <th>Recipe#</th><th>Recipe description</th><th className="num">Jobs</th><th className="num">pcs</th>
        <th className="num">dm2</th><th>Start<br/>Time</th><th>End<br/>Time</th><th>Duration</th>
       </tr></thead>
       <tbody>
        {rows.map((x:any)=>{
         const cell=(group:string,code?:string)=>x.resource_group===group&&(!code||x.resource_code===code)?<b>{x.batch_no}</b>:"—";
         return <tr key={x.id}>
          <td>{cell("SPX_CLEAN")}</td><td>{cell("MANUAL_DBL")}</td><td>{cell("AUTO_DBL")}</td>
          <td>{cell("PLATING")}</td><td>{cell("HE_BAKE")}</td>
          <td>{cell("PASSIVATION")}</td><td>{cell("MANUALSP")}</td><td>{cell("AUTOSHP")}</td>
          <td>{x.resource_group==="CHEMICAL_LINE"?<><b>{x.batch_no}</b><small className="planning-sub">{x.resource_code}</small></>:"—"}</td>
          <td>{cell("PAINTING","CAB1")}</td><td>{cell("PAINTING","CAB2")}</td><td>{cell("PAINTING","CAB3")}</td>
          <td>{cell("PAINTING","CAB4")}</td>
          <td>{cell("PAINT_POWDER")}</td><td><b>{x.resource_code}</b></td>
          <td>{x.recipe_no||"—"}</td><td>{x.recipe_name||"—"}</td>
          <td className="num">{x.total_jobs}</td><td className="num">{fmt(x.total_qty)}</td>
          <td className="num">{fmt(x.total_surface_dm2)}</td>
          <td className="mono">{time(x.planned_start)}</td><td className="mono">{time(x.planned_end)}</td>
          <td className="mono">{hhmm(x.duration_minutes)}</td>
         </tr>
        })}
        {!rows.length&&<tr><td colSpan={23} className="muted">Chưa có Batch được xếp lịch cho ngày này.</td></tr>}
       </tbody>
      </table>
     </div>
    </div>

    <div className="erp-table-panel section production-timeline-panel">
     <div className="erp-panel-head">
      <b>Production Timeline</b>
      <span>
       {date} 06:00 → next day 06:00 · {productionResources.length} resources
      </span>
     </div>

     <div className="production-timeline-scroll">
      <div className="production-timeline-frame">
       <div className="production-timeline-hours">
        <div className="production-timeline-corner">Resource</div>
        <div className="production-timeline-hour-track">
         {timelineHours.map((hour,index)=>
          <span
           key={`${hour}-${index}`}
           className="production-timeline-hour"
           style={{left:`${(index/24)*100}%`}}
          >
           {String(hour).padStart(2,"0")}:00
          </span>
         )}
        </div>
       </div>

       {productionResources.map((r:any)=>{
        const items=timelineRows.filter((x:any)=>x.resource_code===r.resource_code);

        return <div className="production-timeline-row" key={r.resource_code}>
         <div className="schedule-resource-label">
          <b>{r.resource_code}</b>
          <small>{r.resource_name}</small>
         </div>

         <div className="production-timeline-track">
          {items.map((x:any)=>{
           const style=timelineStyle(x.planned_start,x.planned_end);
           if(!style)return null;

           return <div
            className={`schedule-chip production-timeline-batch ${
             r.resource_group==="CHEMICAL_LINE"
              ?"chemical"
              :r.resource_group==="PAINTING"
               ?"paint"
               :"other"
            }`}
            key={x.id}
            style={style}
            title={`${x.batch_no} · ${x.standard_operation} · ${time(x.planned_start)}–${time(x.planned_end)}`}
           >
            <b>{time(x.planned_start)}–{time(x.planned_end)}</b>
            <span>{x.batch_no}</span>
            <span>{x.standard_operation}</span>
            {x.recipe_no&&<span>Recipe {x.recipe_no}</span>}
           </div>
          })}
         </div>
        </div>
       })}
      </div>
     </div>
    </div>
   </section>
  </main>
 }finally{c.release()}
}
