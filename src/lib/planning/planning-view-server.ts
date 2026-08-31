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
 let stViewParams:string[]=[];
 if(stViewCodes===null){
  const defQ=await c.query(`
   select upper(trim(operation_code)) op from md_st_operation_scope
   where is_active=true group by upper(trim(operation_code))
   having not bool_or(operation_type='ST_SCOPE_ONLY')`);
  stViewParams=defQ.rows.map((r:any)=>String(r.op));
 }else stViewParams=stViewCodes;
 return {stViewParams,initialView,serverViews};
}
