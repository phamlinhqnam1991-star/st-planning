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

 // V404: the persisted VIEW is only a SUBSET selector. It can never widen the
 // Planning Board beyond the canonical ST RAW list: active Planning Operations
 // plus active Bridge Intermediate Operations. A Job still needs a live Current
 // Main row from syncPlanningChains, so an unrelated operation cannot enter the
 // board merely by sharing a code. ST_SCOPE_ONLY remains excluded.
 const defQ=await c.query(`
  with ${RAW_ST_VISIBLE_CTE_SQL}
  select
   v.operation_code op,
   exists(
    select 1 from active_raw_scope s
    where s.operation_code=v.operation_code and s.operation_type='PLANNING_OPERATION'
   ) direct_planning
  from visible_st_raw v
  order by v.operation_code`);
 const canonicalCodes=defQ.rows.map((r:any)=>String(r.op||"").trim().toUpperCase()).filter(Boolean);
 const directPlanningCodes=defQ.rows.filter((r:any)=>Boolean(r.direct_planning)).map((r:any)=>String(r.op||"").trim().toUpperCase()).filter(Boolean);
 const canonicalSet=new Set(canonicalCodes);
 const savedFiltered=stViewCodes===null?null:[...new Set(stViewCodes.filter(code=>canonicalSet.has(code)))];
 // V404 legacy-view recovery: V400 saved the full old direct-Planning list and
 // therefore could silently exclude newly restored Bridge Intermediate codes.
 // If a saved view exactly equals that old full set, treat it as "ALL ST" and
 // expand to the latest canonical catalog. Genuine user subsets stay subsets.
 const savedSet=savedFiltered===null?null:new Set(savedFiltered);
 const looksLikeLegacyFullDirect=savedSet!==null
  && savedSet.size===directPlanningCodes.length
  && directPlanningCodes.every((code:string)=>savedSet.has(code));
 const stViewParams=stViewCodes===null||looksLikeLegacyFullDirect
  ?canonicalCodes
  :(savedFiltered||[]);

 if(initialView){
  if(Array.isArray(initialView.stView))initialView.stView=stViewParams;
  const nextOperation=String(initialView.filters?.nextOperation||"").trim().toUpperCase();
  if(nextOperation&&!canonicalSet.has(nextOperation))initialView.filters={...(initialView.filters||{}),nextOperation:""};
 }

 return {stViewParams,initialView,serverViews};
}
