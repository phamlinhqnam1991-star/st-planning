"use client";

import {useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";

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
};

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
 usePopupMessage(message);

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

 return <div className="auto-planning-rule-manager erp-config-editor-stack">

  <div className="erp-table-panel">
   <div className="erp-panel-head">
    <b>Auto Planning Rules</b>
    <span>{rows.length} công đoạn</span>
   </div>

   <div className="table-wrap">
    <table className="erp-table auto-rule-summary">
     <thead>
      <tr>
       <th>Công đoạn</th>
       <th>ST Group</th>
       <th>Bật</th>
       <th>Chế độ</th>
       <th>Thứ tự</th>
       <th>WIP hiện tại</th>
       <th>Batch trước</th>
       <th>Plan Ahead</th>
       <th>Recipe</th>
       <th>Max Jobs</th>
       <th>Max Qty</th>
       <th>Max dm²</th>
       <th className="action"></th>
      </tr>
     </thead>
     <tbody>
      {rows.map(row=>
       <tr key={row.standard_operation} className={row.auto_plan_enabled?"auto-rule-enabled":""}>
        <td><b>{row.standard_operation}</b></td>
        <td>{row.st_group||"—"}</td>
        <td>{row.auto_plan_enabled?"Có":"Không"}</td>
        <td>{row.auto_plan_mode==="OFF"?"Tắt":row.auto_plan_mode==="SUGGEST"?"Đề xuất":"Tự động"}</td>
        <td>{row.auto_plan_order}</td>
        <td>{row.allow_actual_wip_without_previous_batch?"Có":"Không"}</td>
        <td>{row.allow_from_previous_batch?"Có":"Không"}</td>
        <td>{row.allow_plan_ahead?"Có":"Không"}</td>
        <td>{row.require_same_recipe?"Cùng":"Bất kỳ"}</td>
        <td>{row.max_jobs_per_batch??"—"}</td>
        <td>{row.max_qty_per_batch??"—"}</td>
        <td>{row.max_surface_dm2_per_batch??"—"}</td>
        <td>
         <button
          className="btn small"
          type="button"
          onClick={()=>setOpen(open===row.standard_operation?null:row.standard_operation)}
         >
          {open===row.standard_operation?"Đóng":"Cấu hình"}
         </button>
        </td>
       </tr>
      )}
     </tbody>
    </table>
   </div>
  </div>

  {rows.map(row=>open===row.standard_operation&&
   <section className="erp-form-panel erp-inline-editor-panel section auto-rule-editor" key={`edit-${row.standard_operation}`}>
    <div className="erp-panel-head">
     <b>{row.standard_operation} · Cấu hình Auto Planning</b>
     <button
      className="btn primary small"
      type="button"
      disabled={busy===row.standard_operation}
      onClick={()=>save(row)}
     >
      {busy===row.standard_operation?"Đang lưu...":"Lưu Rule"}
     </button>
    </div>

    <div className="auto-rule-body">
     <div className="auto-rule-section">
      <h3>1. Kích hoạt & chế độ</h3>
      <div className="auto-rule-grid">
       <Toggle
        label="Bật Auto Planning"
        checked={row.auto_plan_enabled}
        onChange={v=>patch(row.standard_operation,{auto_plan_enabled:v})}
        title="Bật/tắt Auto Planning cho riêng Standard Operation này."
       />

       <label>Chế độ
        <select
         className="input"
         value={row.auto_plan_mode}
         onChange={e=>patch(row.standard_operation,{auto_plan_mode:e.target.value as Rule["auto_plan_mode"]})}
        >
         <option value="OFF">Tắt</option>
         <option value="SUGGEST">Đề xuất</option>
         <option value="FULL_AUTO">Tự động</option>
        </select>
       </label>

       <label>Thứ tự Auto Plan
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
      <h3>2. Điều kiện Job được Auto Plan</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle
        label="Cho phép công đoạn đầu"
        checked={row.allow_first_plan_operation}
        onChange={v=>patch(row.standard_operation,{allow_first_plan_operation:v})}
        title="Cho phép Job có Previous Main Plan Op = START."
       />
       <Toggle
        label="Cho WIP hiện tại không cần Batch trước"
        checked={row.allow_actual_wip_without_previous_batch}
        onChange={v=>patch(row.standard_operation,{allow_actual_wip_without_previous_batch:v})}
        title="Ví dụ NextOperation/Next Main Plan Op đang là BSAUNSLD: cho phép tạo lô BSAUNSLD dù chưa có Batch trước."
       />
       <Toggle
        label="Cho Job từ Batch trước"
        checked={row.allow_from_previous_batch}
        onChange={v=>patch(row.standard_operation,{allow_from_previous_batch:v})}
        title="Cho phép Job đi vào operation này vì operation chính trước đã có Batch."
       />
       <Toggle
        label="Cho Plan Ahead"
        checked={row.allow_plan_ahead}
        onChange={v=>patch(row.standard_operation,{allow_plan_ahead:v})}
        title="Cho phép lập kế hoạch khi Batch trước đã được lên kế hoạch, chưa cần hoàn thành thực tế."
       />
       <Toggle
        label="Yêu cầu công đoạn trước hoàn thành"
        checked={row.require_previous_completed}
        onChange={v=>patch(row.standard_operation,{require_previous_completed:v})}
        title="Chỉ lập kế hoạch tự động khi công đoạn chính trước đã hoàn thành."
       />
       <Toggle
        label="Bắt buộc có Recipe"
        checked={row.recipe_required}
        onChange={v=>patch(row.standard_operation,{recipe_required:v})}
        title="Không đưa Job vào Auto Planning nếu chưa xác định được Recipe."
       />
       <Toggle
        label="Loại Job có Open DMR / Hold"
        checked={row.exclude_open_dmr}
        onChange={v=>patch(row.standard_operation,{exclude_open_dmr:v})}
        title="Loại Job đang có Open DMR/Hold khỏi Auto Planning."
       />
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>3. Điều kiện bắt buộc cùng nhóm</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle label="Cùng Recipe" checked={row.require_same_recipe} onChange={v=>patch(row.standard_operation,{require_same_recipe:v})}/>
       <Toggle label="Gom theo Batch trước" checked={row.group_by_previous_batch} onChange={v=>patch(row.standard_operation,{group_by_previous_batch:v})}/>
       <Toggle label="Cùng Part" checked={row.require_same_part} onChange={v=>patch(row.standard_operation,{require_same_part:v})}/>
       <Toggle label="Cùng Revision" checked={row.require_same_revision} onChange={v=>patch(row.standard_operation,{require_same_revision:v})}/>
       <Toggle label="Cùng Program" checked={row.require_same_program} onChange={v=>patch(row.standard_operation,{require_same_program:v})}/>
       <Toggle label="Cùng PRIMER1" checked={row.require_same_primer1} onChange={v=>patch(row.standard_operation,{require_same_primer1:v})}/>
       <Toggle label="Cùng PRIMER2" checked={row.require_same_primer2} onChange={v=>patch(row.standard_operation,{require_same_primer2:v})}/>
       <Toggle label="Cùng PRIMER3" checked={row.require_same_primer3} onChange={v=>patch(row.standard_operation,{require_same_primer3:v})}/>
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>4. Giới hạn Batch</h3>
      <div className="auto-rule-limit-grid">
       <label>Jobs tối thiểu
        <input className="input" type="number" min="0" value={row.min_jobs_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_jobs_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>Jobs tối đa
        <input className="input" type="number" min="1" value={row.max_jobs_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_jobs_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>Qty tối thiểu
        <input className="input" type="number" min="0" step="any" value={row.min_qty_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_qty_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>Qty tối đa
        <input className="input" type="number" min="0" step="any" value={row.max_qty_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_qty_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>Surface tối thiểu (dm²)
        <input className="input" type="number" min="0" step="any" value={row.min_surface_dm2_per_batch??""}
         onChange={e=>patch(row.standard_operation,{min_surface_dm2_per_batch:nullable(e.target.value)})}/>
       </label>
       <label>Surface tối đa (dm²)
        <input className="input" type="number" min="0" step="any" value={row.max_surface_dm2_per_batch??""}
         onChange={e=>patch(row.standard_operation,{max_surface_dm2_per_batch:nullable(e.target.value)})}/>
       </label>
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>5. Điều kiện tách sang Batch mới</h3>
      <div className="auto-rule-toggle-grid">
       <Toggle label="Tách khi khác Recipe" checked={row.split_on_recipe} onChange={v=>patch(row.standard_operation,{split_on_recipe:v})}/>
       <Toggle label="Tách khi khác Batch trước" checked={row.split_on_previous_batch} onChange={v=>patch(row.standard_operation,{split_on_previous_batch:v})}/>
       <Toggle label="Tách khi khác Part" checked={row.split_on_part} onChange={v=>patch(row.standard_operation,{split_on_part:v})}/>
       <Toggle label="Tách khi khác Revision" checked={row.split_on_revision} onChange={v=>patch(row.standard_operation,{split_on_revision:v})}/>
       <Toggle label="Tách khi khác Program" checked={row.split_on_program} onChange={v=>patch(row.standard_operation,{split_on_program:v})}/>
       <Toggle label="Tách khi khác PRIMER1" checked={row.split_on_primer1} onChange={v=>patch(row.standard_operation,{split_on_primer1:v})}/>
       <Toggle label="Tách khi khác PRIMER2" checked={row.split_on_primer2} onChange={v=>patch(row.standard_operation,{split_on_primer2:v})}/>
       <Toggle label="Tách khi khác PRIMER3" checked={row.split_on_primer3} onChange={v=>patch(row.standard_operation,{split_on_primer3:v})}/>
      </div>
      <small className="muted">
       Khi đạt giới hạn Jobs / Qty / Surface, hệ thống đóng Batch hiện tại và mở Batch kế tiếp.
      </small>
     </div>

     <div className="auto-rule-section">
      <div className="auto-rule-section-head">
       <h3>6. Thứ tự ưu tiên · tối đa 10 cấp</h3>
       <button className="btn small" type="button" onClick={()=>addPriority(row.standard_operation)} disabled={row.priority_rules.length>=10}>
        + Thêm mức ưu tiên
       </button>
      </div>

      <div className="auto-rule-priority-list">
       {row.priority_rules.map((rule,index)=>
        <div className="auto-rule-priority-row" key={`${index}-${rule.field}`}>
         <span>{index+1}</span>
         <select className="input" value={rule.field} onChange={e=>patchPriority(row.standard_operation,index,{field:e.target.value})}>
          <option value="">Chọn cột Candidate...</option>
          {fieldOptions.map(f=>
           <option key={f.key} value={f.key}>{f.label}</option>
          )}
         </select>
         <select className="input" value={rule.direction} onChange={e=>patchPriority(row.standard_operation,index,{direction:e.target.value as "asc"|"desc"})}>
          <option value="asc">Tăng dần</option>
          <option value="desc">Giảm dần</option>
         </select>
         <button className="btn small" type="button" onClick={()=>removePriority(row.standard_operation,index)}>×</button>
        </div>
       )}
       {!row.priority_rules.length&&<div className="muted">Chưa đặt ưu tiên; hệ thống dùng thứ tự Job mặc định.</div>}
      </div>
     </div>

     <div className="auto-rule-section">
      <h3>7. Ghi chú</h3>
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
       {busy===row.standard_operation?"Đang lưu...":`Lưu ${row.standard_operation}`}
      </button>
     </div>
    </div>
   </section>
  )}
 </div>
}
