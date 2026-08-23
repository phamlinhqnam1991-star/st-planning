"use client";

import {useMemo,useState} from "react";

type Rule={
 standard_operation:string;
 st_group:string|null;
 auto_plan_enabled:boolean;
 auto_plan_mode:"OFF"|"SUGGEST"|"FULL_AUTO";
 auto_plan_order:number;

 allow_first_plan_operation:boolean;
 allow_actual_wip_without_previous_batch:boolean;
 allow_from_previous_batch:boolean;
 allow_plan_ahead:boolean;
 require_previous_completed:boolean;

 require_same_recipe:boolean;
 group_by_previous_batch:boolean;
 require_same_part:boolean;
 require_same_revision:boolean;
 require_same_program:boolean;
 require_same_primer1:boolean;
 require_same_primer2:boolean;
 require_same_primer3:boolean;

 recipe_required:boolean;
 exclude_open_dmr:boolean;

 min_jobs_per_batch:number|null;
 max_jobs_per_batch:number|null;
 min_qty_per_batch:number|null;
 max_qty_per_batch:number|null;
 min_surface_dm2_per_batch:number|null;
 max_surface_dm2_per_batch:number|null;

 split_on_recipe:boolean;
 split_on_previous_batch:boolean;
 split_on_part:boolean;
 split_on_revision:boolean;
 split_on_program:boolean;
 split_on_primer1:boolean;
 split_on_primer2:boolean;
 split_on_primer3:boolean;

 allow_empty_batch:boolean;
 allow_schedule_empty_batch:boolean;
 auto_create_empty_batch:boolean;
 auto_fill_scheduled_batch:boolean;
 require_recipe_before_schedule:boolean;
 require_paint_type_before_schedule:boolean;
 batch_lock_before_start_minutes:number;

 priority_rules:{field:string;direction:"asc"|"desc"}[];
 note:string|null;
};

type FieldOption={
 key:string;
 label:string;
 source:string;
};

const b=(v:unknown)=>Boolean(v);
const nullable=(v:string)=>{
 const s=v.trim();
 return s===""?null:Number(s);
};

function Toggle({
 label,checked,onChange,title
}:{label:string;checked:boolean;onChange:(v:boolean)=>void;title?:string}){
 return <label className="auto-rule-toggle" title={title}>
  <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
  <span>{label}</span>
 </label>;
}

export function AutoPlanningRuleManager({
 initialRules,
 fieldOptions
}:{
 initialRules:Rule[];
 fieldOptions:FieldOption[];
}){
 const [rows,setRows]=useState<Rule[]>(initialRules);
 const [open,setOpen]=useState<string|null>(null);
 const [busy,setBusy]=useState("");
 const [message,setMessage]=useState("");

 const byOperation=useMemo(
  ()=>new Map(rows.map((x,i)=>[x.standard_operation,i])),
  [rows]
 );

 function patch(op:string,part:Partial<Rule>){
  const index=byOperation.get(op);
  if(index==null)return;
  setRows(prev=>prev.map((r,i)=>i===index?{...r,...part}:r));
 }

 function patchPriority(op:string,index:number,part:Partial<{field:string;direction:"asc"|"desc"}>){
  const row=rows[byOperation.get(op)??-1];
  if(!row)return;
  const next=[...(row.priority_rules||[])];
  while(next.length<=index)next.push({field:"",direction:"asc"});
  next[index]={...next[index],...part};
  patch(op,{priority_rules:next});
 }

 function addPriority(op:string){
  const row=rows[byOperation.get(op)??-1];
  if(!row || row.priority_rules.length>=10)return;
  patch(op,{priority_rules:[...row.priority_rules,{field:"",direction:"asc"}]});
 }

 function removePriority(op:string,index:number){
  const row=rows[byOperation.get(op)??-1];
  if(!row)return;
  patch(op,{priority_rules:row.priority_rules.filter((_,i)=>i!==index)});
 }

 async function save(row:Rule){
  setBusy(row.standard_operation);
  setMessage("");

  try{
   const r=await fetch("/api/config/auto-planning-rules",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(row)
   });
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"Không lưu được Auto Planning Rule.");

   setMessage(`Đã lưu ${row.standard_operation}.`);
   setTimeout(()=>setMessage(""),1800);
  }catch(e){
   setMessage(e instanceof Error?e.message:"Không lưu được Auto Planning Rule.");
  }finally{
   setBusy("");
  }
 }

 return <div className="auto-planning-rule-manager">
  {message&&<div className="notice auto-rule-message">{message}</div>}

  <div className="erp-table-panel">
   <div className="erp-panel-head">
    <b>Auto Planning Rules</b>
    <span>{rows.length} Standard Operations</span>
   </div>

   <div className="table-wrap">
    <table className="erp-table auto-rule-summary">
     <thead>
      <tr>
       <th>Operation</th>
       <th>ST Group</th>
       <th>Enabled</th>
       <th>Mode</th>
       <th>Run Order</th>
       <th>Actual WIP</th>
       <th>Prev Batch</th>
       <th>Plan Ahead</th>
       <th>Recipe</th>
       <th>Max Jobs</th>
       <th>Max Qty</th>
       <th>Max dm²</th>
       <th></th>
      </tr>
     </thead>
     <tbody>
      {rows.map(row=>
       <tr key={row.standard_operation} className={row.auto_plan_enabled?"auto-rule-enabled":""}>
        <td><b>{row.standard_operation}</b></td>
        <td>{row.st_group||"—"}</td>
        <td>{row.auto_plan_enabled?"YES":"NO"}</td>
        <td>{row.auto_plan_mode}</td>
        <td>{row.auto_plan_order}</td>
        <td>{row.allow_actual_wip_without_previous_batch?"YES":"NO"}</td>
        <td>{row.allow_from_previous_batch?"YES":"NO"}</td>
        <td>{row.allow_plan_ahead?"YES":"NO"}</td>
        <td>{row.require_same_recipe?"SAME":"ANY"}</td>
        <td>{row.max_jobs_per_batch??"—"}</td>
        <td>{row.max_qty_per_batch??"—"}</td>
        <td>{row.max_surface_dm2_per_batch??"—"}</td>
        <td>
         <button
          className="btn small"
          type="button"
          onClick={()=>setOpen(open===row.standard_operation?null:row.standard_operation)}
         >
          {open===row.standard_operation?"Close":"Configure"}
         </button>
        </td>
       </tr>
      )}
     </tbody>
    </table>
   </div>
  </div>

  {rows.map(row=>open===row.standard_operation&&
   <section className="erp-table-panel section auto-rule-editor" key={`edit-${row.standard_operation}`}>
    <div className="erp-panel-head">
     <b>{row.standard_operation} · Auto Planning Configuration</b>
     <button
      className="btn primary small"
      type="button"
      disabled={busy===row.standard_operation}
      onClick={()=>save(row)}
     >
      {busy===row.standard_operation?"Saving...":"Save Rule"}
     </button>
    </div>

    <div className="auto-rule-body">
     <div className="auto-rule-section">
      <h3>1. Kích hoạt & chế độ</h3>
      <div className="auto-rule-grid">
       <Toggle
        label="AutoPlanEnabled"
        checked={row.auto_plan_enabled}
        onChange={v=>patch(row.standard_operation,{auto_plan_enabled:v})}
        title="Bật/tắt Auto Planning cho riêng Standard Operation này."
       />

       <label>AutoPlanMode
        <select
         className="input"
         value={row.auto_plan_mode}
         onChange={e=>patch(row.standard_operation,{auto_plan_mode:e.target.value as Rule["auto_plan_mode"]})}
        >
         <option value="OFF">OFF</option>
         <option value="SUGGEST">SUGGEST</option>
         <option value="FULL_AUTO">FULL_AUTO</option>
        </select>
       </label>

       <label>AutoPlanOrder
        <input
         className="input"
         type="number"
         min="1"
         value={row.auto_plan_order}
         onChange={e=>patch(row.standard_operation,{auto_plan_order:Number(e.target.value)||100})}
        />
       </label>
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>2. Eligibility · Job nào được Auto Plan</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle
        label="AllowFirstPlanOperation"
        checked={row.allow_first_plan_operation}
        onChange={v=>patch(row.standard_operation,{allow_first_plan_operation:v})}
        title="Cho phép Job có Previous Main Plan Op = START."
       />
       <Toggle
        label="AllowActualWipWithoutPreviousBatch"
        checked={row.allow_actual_wip_without_previous_batch}
        onChange={v=>patch(row.standard_operation,{allow_actual_wip_without_previous_batch:v})}
        title="Ví dụ NextOperation/Next Main Plan Op đang là BSAUNSLD: cho phép tạo lô BSAUNSLD dù chưa có Batch trước."
       />
       <Toggle
        label="AllowFromPreviousBatch"
        checked={row.allow_from_previous_batch}
        onChange={v=>patch(row.standard_operation,{allow_from_previous_batch:v})}
        title="Cho phép Job đi vào operation này vì operation chính trước đã có Batch."
       />
       <Toggle
        label="AllowPlanAhead"
        checked={row.allow_plan_ahead}
        onChange={v=>patch(row.standard_operation,{allow_plan_ahead:v})}
        title="YES: Previous Batch mới PLANNED là đủ; chưa cần hoàn thành thực tế."
       />
       <Toggle
        label="RequirePreviousCompleted"
        checked={row.require_previous_completed}
        onChange={v=>patch(row.standard_operation,{require_previous_completed:v})}
        title="Bắt buộc công đoạn chính trước Completed trước khi Auto Plan."
       />
       <Toggle
        label="RecipeRequired"
        checked={row.recipe_required}
        onChange={v=>patch(row.standard_operation,{recipe_required:v})}
        title="Không đưa Job vào Auto Planning nếu chưa resolve được Recipe."
       />
       <Toggle
        label="ExcludeOpenDMR"
        checked={row.exclude_open_dmr}
        onChange={v=>patch(row.standard_operation,{exclude_open_dmr:v})}
        title="Loại Job đang có Open DMR/Hold khỏi Auto Planning."
       />
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>3. Điều kiện bắt buộc cùng nhóm</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle label="RequireSameRecipe" checked={row.require_same_recipe} onChange={v=>patch(row.standard_operation,{require_same_recipe:v})}/>
       <Toggle label="GroupByPreviousBatch" checked={row.group_by_previous_batch} onChange={v=>patch(row.standard_operation,{group_by_previous_batch:v})}/>
       <Toggle label="RequireSamePart" checked={row.require_same_part} onChange={v=>patch(row.standard_operation,{require_same_part:v})}/>
       <Toggle label="RequireSameRevision" checked={row.require_same_revision} onChange={v=>patch(row.standard_operation,{require_same_revision:v})}/>
       <Toggle label="RequireSameProgram" checked={row.require_same_program} onChange={v=>patch(row.standard_operation,{require_same_program:v})}/>
       <Toggle label="RequireSamePrimer1" checked={row.require_same_primer1} onChange={v=>patch(row.standard_operation,{require_same_primer1:v})}/>
       <Toggle label="RequireSamePrimer2" checked={row.require_same_primer2} onChange={v=>patch(row.standard_operation,{require_same_primer2:v})}/>
       <Toggle label="RequireSamePrimer3" checked={row.require_same_primer3} onChange={v=>patch(row.standard_operation,{require_same_primer3:v})}/>
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>4. Giới hạn Batch</h3>
      <div className="auto-rule-limit-grid">
       <label>MinJobsPerBatch
        <input className="input" type="number" min="0" value={row.min_jobs_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_jobs_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>MaxJobsPerBatch
        <input className="input" type="number" min="1" value={row.max_jobs_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_jobs_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>MinQtyPerBatch
        <input className="input" type="number" min="0" step="any" value={row.min_qty_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_qty_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>MaxQtyPerBatch
        <input className="input" type="number" min="0" step="any" value={row.max_qty_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_qty_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>MinSurfaceDm2PerBatch
        <input className="input" type="number" min="0" step="any" value={row.min_surface_dm2_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_surface_dm2_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>MaxSurfaceDm2PerBatch
        <input className="input" type="number" min="0" step="any" value={row.max_surface_dm2_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_surface_dm2_per_batch:nullable(e.target.value)})}/>
       </label>
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>5. Điều kiện tách sang Batch mới</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle label="SplitOnRecipe" checked={row.split_on_recipe} onChange={v=>patch(row.standard_operation,{split_on_recipe:v})}/>
       <Toggle label="SplitOnPreviousBatch" checked={row.split_on_previous_batch} onChange={v=>patch(row.standard_operation,{split_on_previous_batch:v})}/>
       <Toggle label="SplitOnPart" checked={row.split_on_part} onChange={v=>patch(row.standard_operation,{split_on_part:v})}/>
       <Toggle label="SplitOnRevision" checked={row.split_on_revision} onChange={v=>patch(row.standard_operation,{split_on_revision:v})}/>
       <Toggle label="SplitOnProgram" checked={row.split_on_program} onChange={v=>patch(row.standard_operation,{split_on_program:v})}/>
       <Toggle label="SplitOnPrimer1" checked={row.split_on_primer1} onChange={v=>patch(row.standard_operation,{split_on_primer1:v})}/>
       <Toggle label="SplitOnPrimer2" checked={row.split_on_primer2} onChange={v=>patch(row.standard_operation,{split_on_primer2:v})}/>
       <Toggle label="SplitOnPrimer3" checked={row.split_on_primer3} onChange={v=>patch(row.standard_operation,{split_on_primer3:v})}/>
      </div>
      <small className="muted">
       Khi Max Jobs / Max Qty / Max Surface đạt giới hạn, engine cũng tự đóng Batch hiện tại và mở Batch kế tiếp.
      </small>
     </div>

     <div className="auto-rule-section">
      <h3>6. Empty Batch / Auto Schedule / Auto Fill Foundation</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle
        label="AllowEmptyBatch"
        checked={row.allow_empty_batch}
        onChange={v=>patch(row.standard_operation,{allow_empty_batch:v})}
        title="Cho phép tạo Batch Jobs=0 trước khi WIP tới."
       />
       <Toggle
        label="AllowScheduleEmptyBatch"
        checked={row.allow_schedule_empty_batch}
        onChange={v=>patch(row.standard_operation,{allow_schedule_empty_batch:v})}
        title="Cho phép điều độ Batch trống rồi Fill Job sau."
       />
       <Toggle
        label="AutoCreateEmptyBatch"
        checked={row.auto_create_empty_batch}
        onChange={v=>patch(row.standard_operation,{auto_create_empty_batch:v})}
        title="Dành cho Auto Batch tương lai. v87 chưa tự tạo."
       />
       <Toggle
        label="AutoFillScheduledBatch"
        checked={row.auto_fill_scheduled_batch}
        onChange={v=>patch(row.standard_operation,{auto_fill_scheduled_batch:v})}
        title="Dành cho Auto Fill tương lai. v87 chưa tự Fill."
       />
       <Toggle
        label="RequireRecipeBeforeSchedule"
        checked={row.require_recipe_before_schedule}
        onChange={v=>patch(row.standard_operation,{require_recipe_before_schedule:v})}
        title="Rule chuẩn bị cho Auto Schedule."
       />
       <Toggle
        label="RequirePaintTypeBeforeSchedule"
        checked={row.require_paint_type_before_schedule}
        onChange={v=>patch(row.standard_operation,{require_paint_type_before_schedule:v})}
        title="Rule chuẩn bị cho Auto Schedule của các công đoạn sơn."
       />
      </div>

      <div className="auto-rule-limit-grid auto-rule-lock-grid">
       <label>BatchLockBeforeStartMinutes
        <input
         className="input"
         type="number"
         min="0"
         step="1"
         value={row.batch_lock_before_start_minutes??0}
         onChange={e=>patch(row.standard_operation,{
          batch_lock_before_start_minutes:Math.max(0,Number(e.target.value)||0)
         })}
        />
       </label>
      </div>

      <small className="muted">
       Các Auto flag chỉ là cấu hình nền ở v87; chưa tự chạy Auto Plan/Auto Batch/Auto Schedule.
      </small>
     </div>

     <div className="auto-rule-section">
      <div className="auto-rule-section-head">
       <h3>7. Priority · tối đa 10 cấp</h3>
       <button className="btn small" type="button" onClick={()=>addPriority(row.standard_operation)} disabled={row.priority_rules.length>=10}>
        + Priority Level
       </button>
      </div>

      <div className="auto-rule-priority-list">
       {row.priority_rules.map((rule,index)=>
        <div className="auto-rule-priority-row" key={`${index}-${rule.field}`}>
         <span>{index+1}</span>
         <select className="input" value={rule.field} onChange={e=>patchPriority(row.standard_operation,index,{field:e.target.value})}>
          <option value="">Select Candidate column...</option>
          {fieldOptions.map(f=>
           <option key={f.key} value={f.key}>{f.label} · {f.source}</option>
          )}
         </select>
         <select className="input" value={rule.direction} onChange={e=>patchPriority(row.standard_operation,index,{direction:e.target.value as "asc"|"desc"})}>
          <option value="asc">ASC</option>
          <option value="desc">DESC</option>
         </select>
         <button className="btn small" type="button" onClick={()=>removePriority(row.standard_operation,index)}>×</button>
        </div>
       )}
       {!row.priority_rules.length&&<div className="muted">Chưa đặt Priority. Engine sẽ dùng thứ tự ổn định theo Job.</div>}
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>8. Note</h3>
      <textarea
       className="input"
       rows={3}
       value={row.note||""}
       placeholder="Ghi chú logic riêng cho công đoạn này..."
       onChange={e=>patch(row.standard_operation,{note:e.target.value})}
      />
     </div>

     <div className="auto-rule-savebar">
      <button
       className="btn primary"
       type="button"
       disabled={busy===row.standard_operation}
       onClick={()=>save(row)}
      >
       {busy===row.standard_operation?"Saving...":`Save ${row.standard_operation}`}
      </button>
     </div>
    </div>
   </section>
  )}
 </div>
}
