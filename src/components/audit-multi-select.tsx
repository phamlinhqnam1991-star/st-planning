"use client";

import {useEffect,useMemo,useState} from "react";

export type AuditMultiSelectOption={value:string;label:string};

type Props={
 name:string;
 options:AuditMultiSelectOption[];
 selected?:string[];
 placeholder?:string;
 searchPlaceholder?:string;
 minWidth?:number;
};

export function AuditMultiSelect({
 name,options,selected=[],placeholder="All",searchPlaceholder="Tìm...",minWidth=120,
}:Props){
 const initial=useMemo(()=>Array.from(new Set(selected.filter(Boolean))),[selected]);
 const [chosen,setChosen]=useState<string[]>(initial);
 const selectedKey=selected.join("\u0001");
 useEffect(()=>{setChosen(Array.from(new Set(selected.filter(Boolean))));},[selectedKey,selected]);
 const [search,setSearch]=useState("");
 const selectedSet=useMemo(()=>new Set(chosen),[chosen]);
 const normalizedSearch=search.trim().toLocaleLowerCase("vi");
 const selectedLabels=options.filter(o=>selectedSet.has(o.value)).map(o=>o.label);
 const summary=selectedLabels.length===0
  ?placeholder
  :selectedLabels.length===1
   ?selectedLabels[0]
   :`${selectedLabels.length} đã chọn`;

 function toggle(value:string,checked:boolean){
  setChosen(prev=>{
   if(checked)return prev.includes(value)?prev:[...prev,value];
   return prev.filter(v=>v!==value);
  });
 }

 return <details className="audit-multi-select" style={{minWidth}}>
  <summary title={selectedLabels.join(", ")}>{summary}</summary>
  <div className="audit-multi-popover">
   <div className="audit-multi-head">
    <input
     className="input"
     type="search"
     value={search}
     onChange={e=>setSearch(e.target.value)}
     placeholder={searchPlaceholder}
     aria-label={searchPlaceholder}
    />
    <button type="button" className="audit-multi-clear" onClick={()=>setChosen([])} disabled={!chosen.length}>Xóa chọn</button>
   </div>
   <div className="audit-multi-options">
    {options.map(option=>{
     const visible=!normalizedSearch||option.label.toLocaleLowerCase("vi").includes(normalizedSearch);
     const checked=selectedSet.has(option.value);
     return <label key={option.value} className={`audit-multi-option ${visible?"":"is-hidden"}`}>
      <input
       type="checkbox"
       name={name}
       value={option.value}
       checked={checked}
       onChange={e=>toggle(option.value,e.target.checked)}
      />
      <span>{option.label}</span>
     </label>;
    })}
    {!options.length?<div className="muted audit-multi-empty">Không có giá trị</div>:null}
   </div>
  </div>
 </details>;
}
