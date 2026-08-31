import type {Candidate,RouteStatusItem,SelectedTarget,TimeRule} from "./types";

export const normalized=(v:unknown)=>String(v??"").trim().toUpperCase();

export function formatNumber(value:unknown,maxDecimals=2){
 const n=Number(value??0);
 if(!Number.isFinite(n))return "0";
 const fixed=n.toFixed(maxDecimals);
 let [whole,decimal]=fixed.split(".");
 whole=whole.replace(/\B(?=(\d{3})+(?!\d))/g,".");
 decimal=(decimal||"").replace(/0+$/g,"");
 return decimal?`${whole},${decimal}`:whole;
}

export function minutesToHHMM(v:number|null){
 if(v==null)return "—";
 const h=Math.floor(v/60);
 const m=v%60;
 return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

export function estimateMinutes(rules:TimeRule[],qty:number,surface:number){
 const sorted=[...rules].sort((a,b)=>Number(a.priority||0)-Number(b.priority||0));
 for(const r of sorted){
  if(r.calc_type==="FIXED_HOURS"&&r.fixed_hours!=null)return Math.round(Number(r.fixed_hours)*60);
  if(r.calc_type==="QTY_SURFACE"){
   const okQty=(r.qty_min==null||qty>=Number(r.qty_min))&&(r.qty_max==null||qty<=Number(r.qty_max));
   const okSurface=(r.surface_min_dm2==null||surface>=Number(r.surface_min_dm2))&&(r.surface_max_dm2==null||surface<=Number(r.surface_max_dm2));
   if(okQty&&okSurface&&r.standard_hours!=null)return Math.round(Number(r.standard_hours)*60);
  }
 }
 return null;
}

export function computeSelectableTarget(row:Candidate):SelectedTarget|null{
 const route=(row.route_status||[])
  .filter(r=>r.standard_operation&&normalized(r.standard_operation)!=="PIONBL")
  .sort((a,b)=>Number(a.source_seq||0)-Number(b.source_seq||0));

 const persistedReady=route.find(r=>normalized(r.route_status)==="READY"&&Number.isFinite(Number(r.planning_job_operation_id)));
 if(persistedReady){
  return {
   id:Number(persistedReady.planning_job_operation_id),candidateId:Number(row.id),
   standardOperation:String(persistedReady.standard_operation||""),
   sourceOperation:String(persistedReady.source_operation||""),routeItem:persistedReady
  };
 }

 if(row.planning_status==="ELIGIBLE"&&Number.isFinite(Number(row.id))&&row.standard_operation){
  return {
   id:Number(row.id),candidateId:Number(row.id),standardOperation:String(row.standard_operation||""),
   sourceOperation:String(row.source_operation_code||""),routeItem:null
  };
 }

 const computedReady=route.find(r=>normalized(r.route_status)==="READY");
 if(computedReady&&normalized(computedReady.standard_operation)===normalized(row.standard_operation)&&Number.isFinite(Number(row.id))){
  return {
   id:Number(row.id),candidateId:Number(row.id),standardOperation:String(row.standard_operation||computedReady.standard_operation||""),
   sourceOperation:String(row.source_operation_code||computedReady.source_operation||""),routeItem:computedReady
  };
 }
 return null;
}

export function exactRouteTarget(row:Candidate,item:RouteStatusItem):SelectedTarget|null{
 if(normalized(item.route_status)!=="READY")return null;
 const id=Number(item.planning_job_operation_id);
 if(!Number.isFinite(id)){
  if(normalized(item.standard_operation)===normalized(row.standard_operation)&&Number.isFinite(Number(row.id))){
   return {id:Number(row.id),candidateId:Number(row.id),standardOperation:String(item.standard_operation||row.standard_operation||""),sourceOperation:String(item.source_operation||row.source_operation_code||""),routeItem:item};
  }
  return null;
 }
 return {id,candidateId:Number(row.id),standardOperation:String(item.standard_operation||""),sourceOperation:String(item.source_operation||""),routeItem:item};
}

export function paintSelectionField(operation:string){
 switch(normalized(operation)){
  case "PRIMER":return "PRIMER1";
  case "PRIMER2":return "PRIMER2";
  case "PRIMER3":return "PRIMER3";
  case "TOPCOAT1":return "TOPCOAT1";
  case "TOPCOAT2":return "TOPCOAT2";
  case "ANTI-ABRASION":return "ANTI-ABRASION";
  case "VARNISH":return "VARNISH";
  default:return "";
 }
}

export function paintSelectionKey(row:Candidate,operation:string){
 switch(normalized(operation)){
  case "PRIMER":return normalized(row.part_master_primer1||row.recipe_no);
  case "PRIMER2":return normalized(row.part_master_primer2||row.recipe_no);
  case "PRIMER3":return normalized(row.part_master_primer3||row.recipe_no);
  case "TOPCOAT1":return normalized(row.part_master_topcoat1||row.recipe_no);
  case "TOPCOAT2":return normalized(row.part_master_topcoat2||row.recipe_no);
  case "ANTI-ABRASION":return normalized(row.part_master_antiabration||row.recipe_no);
  case "VARNISH":return normalized(row.part_master_varnish||row.recipe_no);
  default:return "";
 }
}

export function targetRecipeKey(row:Candidate,target:SelectedTarget){
 return String(target.routeItem?.effective_recipe_key||row.effective_recipe_key||row.recipe_key||"").trim()||null;
}

export function routeStatusClass(status:unknown){
 switch(normalized(status)){
  case "DONE":case "COMPLETED":return "route-status-done";
  case "READY":return "route-status-ready";
  case "PLANNED-UNSCHEDULED":return "route-status-unscheduled";
  case "SCHEDULED":return "route-status-scheduled";
  case "RUNNING":return "route-status-running";
  case "HOLD":return "route-status-hold";
  default:return "route-status-waiting";
 }
}

export function priorityRank(value:unknown,today:string){
 const p=normalized(value).replace(/\s+/g," ").replace(/_/g,"-");
 if(p==="CAT3"||p.startsWith("CAT3 "))return 400;
 if(p==="CAT5"||p.startsWith("CAT5 "))return 300;
 if(p==="SALE"||p==="SALES"||p.startsWith("SALE ")||p.startsWith("SALES "))return 200;
 const m=String(today||"").match(/^(\d{4})-(\d{2})-\d{2}$/);
 if(m){
  const names=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const month=`${names[Number(m[2])-1]}-${String(m[1]).slice(-2)}`;
  const compact=month.replace("-","");
  const pc=p.replace(/[-\/\s]/g,"");
  if(p===month||p.startsWith(`${month} `)||pc===compact||pc.startsWith(compact))return 100;
 }
 return 0;
}

export function sortCandidates(rows:Candidate[],today:string){
 return [...rows].sort((a,b)=>{
  const ao=Number.isFinite(Number(a.next_operation_planning_sort_order))?Number(a.next_operation_planning_sort_order):999999;
  const bo=Number.isFinite(Number(b.next_operation_planning_sort_order))?Number(b.next_operation_planning_sort_order):999999;
  if(ao!==bo)return ao-bo;
  const pr=priorityRank(b.priority_type,today)-priorityRank(a.priority_type,today);
  if(pr!==0)return pr;
  return String(a.job_num||"").localeCompare(String(b.job_num||""),undefined,{numeric:true,sensitivity:"base"});
 });
}
