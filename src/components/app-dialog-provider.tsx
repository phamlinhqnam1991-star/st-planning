"use client";

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from "react";

type ConfirmTone="default"|"warning"|"danger";
export type ErpConfirmOptions={
 title?:string;
 message:string;
 detail?:string;
 confirmLabel?:string;
 cancelLabel?:string;
 tone?:ConfirmTone;
};

type Pending={options:ErpConfirmOptions;resolve:(value:boolean)=>void}|null;
const DialogContext=createContext<((options:string|ErpConfirmOptions)=>Promise<boolean>)|null>(null);

export function AppDialogProvider({children}:{children:React.ReactNode}){
 const [pending,setPending]=useState<Pending>(null);
 const pendingRef=useRef<Pending>(null);
 const dialogRef=useRef<HTMLElement|null>(null);
 const returnFocusRef=useRef<HTMLElement|null>(null);

 const confirm=useCallback((input:string|ErpConfirmOptions)=>new Promise<boolean>(resolve=>{
  // Resolve a previous request defensively before opening the next dialog.
  pendingRef.current?.resolve(false);
  const options:ErpConfirmOptions=typeof input==="string"?{message:input}:input;
  const next={options,resolve};
  pendingRef.current=next;
  setPending(next);
 }),[]);

 const finish=useCallback((value:boolean)=>{
  const current=pendingRef.current;
  pendingRef.current=null;
  setPending(null);
  current?.resolve(value);
 },[]);

 useEffect(()=>{
  if(!pending)return;
  const previousOverflow=document.body.style.overflow;
  returnFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  document.body.style.overflow="hidden";
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();finish(false);return;}
   if(event.key!=="Tab"||!dialogRef.current)return;
   const focusable=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  window.addEventListener("keydown",onKey);
  return ()=>{
   document.body.style.overflow=previousOverflow;
   window.removeEventListener("keydown",onKey);
   window.setTimeout(()=>returnFocusRef.current?.focus(),0);
  };
 },[pending,finish]);

 const value=useMemo(()=>confirm,[confirm]);
 const tone=pending?.options.tone||"default";
 return <DialogContext.Provider value={value}>
  {children}
  {pending&&<div className="erp-dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)finish(false)}}>
   <section ref={dialogRef} className={`erp-dialog erp-dialog-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="erp-dialog-title" aria-describedby="erp-dialog-message">
    <div className="erp-dialog-head">
     <div className="erp-dialog-symbol" aria-hidden="true">{tone==="danger"?"!":tone==="warning"?"!":"i"}</div>
     <div>
      <b id="erp-dialog-title">{pending.options.title|| (tone==="danger"?"Xác nhận thao tác":tone==="warning"?"Xác nhận":"Xác nhận")}</b>
      <small>{tone==="danger"?"Thao tác có thể ảnh hưởng dữ liệu hoặc luồng phía sau.":"Kiểm tra thông tin trước khi tiếp tục."}</small>
     </div>
    </div>
    <div className="erp-dialog-body">
     <p id="erp-dialog-message">{pending.options.message}</p>
     {pending.options.detail&&<div className="erp-dialog-detail">{pending.options.detail}</div>}
    </div>
    <div className="erp-dialog-actions">
     <button type="button" className="btn" autoFocus onClick={()=>finish(false)}>{pending.options.cancelLabel||"Hủy"}</button>
     <button type="button" className={tone==="danger"?"btn danger-btn":"btn primary"} onClick={()=>finish(true)}>{pending.options.confirmLabel||"Tiếp tục"}</button>
    </div>
   </section>
  </div>}
 </DialogContext.Provider>;
}

export function useErpConfirm(){
 const ctx=useContext(DialogContext);
 if(!ctx)throw new Error("useErpConfirm must be used inside AppDialogProvider");
 return ctx;
}
