"use client";

import {useEffect,useRef} from "react";
import {pushAppToast,ToastKind} from "@/components/app-toast-provider";

export function usePopupMessage(message:string,kind?:ToastKind){
 const last=useRef("");
 useEffect(()=>{
  const value=String(message||"").trim();
  if(!value){
   last.current="";
   return;
  }
  if(value===last.current)return;
  last.current=value;
  pushAppToast(value,kind);
 },[message,kind]);
}
