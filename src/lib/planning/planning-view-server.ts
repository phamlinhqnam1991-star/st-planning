import {RAW_ST_VISIBLE_CTE_SQL} from "@/lib/planning/raw-st-visible-sql";

export async function resolvePlanningView(c:any,op:string,areaId:string){
 const viewKeys:string[]=[];
 if(op)viewKeys.push(`OP:${op}`);
 if(areaId)viewKeys.push(`AREA:${areaId}`);
 viewKeys.push("SYSTEM");
 const viewQ=await c.query(
  `select view_key,payload from planning_board_view where view_key=any($1)
   order by array_position($2::text[],view_key)`,
  [viewKeys,viewKeys]
 );
 let stViewCodes:string[]|null=null;
 let initialView:any=null;
 const serverViews:Record<string,unknown>={};
 for(const r of viewQ.rows){
  serverViews[String(r.view_key)]=r.payload;
  if(r&&typeof r.payload==="object"){
   const p=r.payload as any;
   if(Array.isArray(p.stView))stViewCodes=p.stView.map((x:unknown)=>String(x).trim().toUpperCase()).filter(Boolean);
   if(initialView===null){
    initialView={
     columns:Array.isArray(p.columns)?p.columns.filter((x:unknown)=>typeof x==="string"):[],
     columnLayout:Array.isArray(p.columnLayout)?p.columnLayout.filter((x:unknown)=>typeof x==="string"):undefined,
     stView:Array.isArray(p.stView)?p.stView.map((x:unknown)=>String(x)):undefined,
     filters:(p.filters&&typeof p.filters==="object")?p.filters:{},
     sortRules:Array.isArray(p.sortRules)?p.sortRules:[],
     density:["normal","compact","ultra"].includes(String(p.density||""))?String(p.density):"compact",
     routeFocus:Boolean(p.routeFocus)
    };
   }
  }
 }

 // v400: the persisted VIEW is only a SUBSET selector. It can never widen the
 // Planning Board beyond the canonical explicit ST PLANNING_OPERATION list.
 // This also cleans legacy saved views that contained Auto-Bridge/intermediate
 // or unrelated RAW NextOperations.
 const defQ=await c.query(`
  with ${RAW_ST_VISIBLE_CTE_SQL}
  select operation_code op
  from visible_st_raw
  order by operation_code`);
 const canonicalCodes=defQ.rows.map((r:any)=>String(r.op||"").trim().toUpperCase()).filter(Boolean);
 const canonicalSet=new Set(canonicalCodes);
 const stViewParams=stViewCodes===null
  ?canonicalCodes
  :[...new Set(stViewCodes.filter(code=>canonicalSet.has(code)))];

 if(initialView){
  if(Array.isArray(initialView.stView))initialView.stView=stViewParams;
  const nextOperation=String(initialView.filters?.nextOperation||"").trim().toUpperCase();
  if(nextOperation&&!canonicalSet.has(nextOperation))initialView.filters={...(initialView.filters||{}),nextOperation:""};
 }

 return {stViewParams,initialView,serverViews};
}
