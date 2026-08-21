import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { ST_OPERATION_SCOPE, LEGACY_ROUTING_SUMMARIES, OPERATION_HEADERS, MATERIAL_FINISH_HEADERS, PROCESS_REQUIREMENT_HEADERS } from "@/data/master-config";

type Obj=Record<string,unknown>;
const clean=(v:unknown)=>v==null?"":String(v).trim();
const num=(v:unknown)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null};

async function upsertRows(c:PoolClient,table:string,cols:string[],rows:unknown[][],keys:string[]){
 if(!rows.length)return;
 const maxRows=Math.max(1,Math.floor(60000/cols.length)); const keyIndexes=keys.map(k=>cols.indexOf(k));
 for(let offset=0;offset<rows.length;offset+=maxRows){
  const source=rows.slice(offset,offset+maxRows); const dedup=new Map<string,unknown[]>();
  for(const r of source)dedup.set(JSON.stringify(keyIndexes.map(i=>r[i])),r); const batch=[...dedup.values()];
  const params:unknown[]=[]; let p=1; const groups=batch.map(r=>`(${r.map(v=>{params.push(v);return `$${p++}`}).join(",")})`).join(",");
  const updates=cols.filter(x=>!keys.includes(x)).map(x=>`${x}=excluded.${x}`).join(",");
  await c.query(`insert into ${table} (${cols.join(",")}) values ${groups} on conflict (${keys.join(",")}) do update set ${updates}`,params);
 }
}
function detailOps(ops:{seq:number,code:string}[]){
 const counts=new Map<string,number>(); for(const o of ops)counts.set(o.code,(counts.get(o.code)||0)+1);
 const base=ops.map((o,i)=>{const next=ops[i+1]?.code||"END"; const use=o.code==="UNMSKG"||(counts.get(o.code)||0)>1; return {...o,next,base:use?`${o.code}_BEFORE_${next}`:o.code,use}});
 const baseCounts=new Map<string,number>(); for(const x of base)if(x.use)baseCounts.set(x.base,(baseCounts.get(x.base)||0)+1);
 const seen=new Map<string,number>(); return base.map(x=>{let code=x.base,name=x.use?`${x.code} before ${x.next}`:x.code; const n=baseCounts.get(x.base)||0;if(x.use&&n>1){const k=(seen.get(x.base)||0)+1;seen.set(x.base,k);code+=`_${String(k).padStart(2,"0")}`;name+=` ${String(k).padStart(2,"0")}`}return {...x,detailCode:code,detailName:name}})
}
export async function seedRoutingConfig(c:PoolClient){
 await upsertRows(c,"public.md_st_operation_scope",["operation_code","is_active"],ST_OPERATION_SCOPE.map(x=>[x,true]),["operation_code"]);
 const rows=LEGACY_ROUTING_SUMMARIES.map(x=>[x.routingCode,x.routingName,0,0,x.signature,true]);
 for(let i=0;i<rows.length;i+=1000)await upsertRows(c,"public.md_st_routing_summary",["routing_code","routing_name","operation_count","part_revision_count","routing_signature","is_active"],rows.slice(i,i+1000),["routing_code"]);
}

export async function importMasterXlsx(filePath:string,c:PoolClient,batchId:string){
 const workbook=new ExcelJS.stream.xlsx.WorkbookReader(filePath,{worksheets:"emit",sharedStrings:"cache",styles:"ignore",hyperlinks:"ignore"});
 let sourceRows=0,routingRows=0; const seenOps=new Set<string>();
 let partRows:unknown[][]=[], revRows:unknown[][]=[], finishRows:unknown[][]=[], reqRows:unknown[][]=[], routeRows:unknown[][]=[];
 const flush=async(force=false)=>{
  if(partRows.length>=1000||force){await upsertRows(c,"public.md_part",["part_num","part_description","program","part_cluster","surface_dm2","is_active","updated_at","last_import_batch_id"],partRows,["part_num"]);partRows=[]}
  if(revRows.length>=3000||force){await upsertRows(c,"public.md_part_revision",["part_num","revision_num","is_active","updated_at","last_import_batch_id"],revRows,["part_num","revision_num"]);revRows=[]}
  if(finishRows.length>=3000||force){await upsertRows(c,"public.md_material_finish",["part_num","revision_num","primer1","primer2","primer3","topcoat1","topcoat2","antiabration","primer1_name","topcoat_name","antiabrasion_name","varinish_name","alloy","temper","tsa","chemicalconv_airbus","is_active","updated_at","last_import_batch_id"],finishRows,["part_num","revision_num"]);finishRows=[]}
  if(reqRows.length>=5000||force){await upsertRows(c,"public.md_process_requirement",["part_num","revision_num","requirement_code","requirement_value","is_active","updated_at","last_import_batch_id"],reqRows,["part_num","revision_num","requirement_code"]);reqRows=[]}
  if(routeRows.length>=5000||force){await upsertRows(c,"public.md_routing_detailed",["part_num","revision_num","source_seq","operation_code","next_operation_code","operation_detail_code","operation_detail_name","is_active","updated_at","last_import_batch_id"],routeRows,["part_num","revision_num","source_seq"]);routingRows+=routeRows.length;routeRows=[]}
 };
 for await(const ws of workbook){
  let headers:string[]=[];
  for await(const row of ws){
   const vals=(row.values as unknown[]).slice(1); if(!headers.length){headers=vals.map(clean); continue}
   const o:Obj={}; headers.forEach((h,i)=>o[h]=vals[i]); const part=clean(o.PartNum),rev=clean(o.RevisionNum); if(!part||!rev)continue; sourceRows++;
   partRows.push([part,clean(o.PartDescription)||null,clean(o.Program)||null,clean(o.PartCluster)||null,num(o["Surface (dm2)"]),true,new Date(),batchId]);
   revRows.push([part,rev,true,new Date(),batchId]);
   finishRows.push([part,rev,...MATERIAL_FINISH_HEADERS.map(h=>clean(o[h])||null),true,new Date(),batchId]);
   for(const h of PROCESS_REQUIREMENT_HEADERS){const v=clean(o[h]);if(v)reqRows.push([part,rev,h,v,true,new Date(),batchId])}
   const ops=OPERATION_HEADERS.map((h,i)=>({seq:(i+1)*10,code:clean(o[h])})).filter(x=>x.code); for(const x of ops)seenOps.add(x.code);
   for(const x of detailOps(ops))routeRows.push([part,rev,x.seq,x.code,x.next==="END"?null:x.next,x.detailCode,x.detailName,true,new Date(),batchId]);
   if(sourceRows%500===0)await flush();
  }
 }
 await flush(true);
 const opRows=[...seenOps].map(x=>[x,x,true,new Date(),batchId]); for(let i=0;i<opRows.length;i+=3000)await upsertRows(c,"public.md_operation",["operation_code","operation_name","is_active","updated_at","last_import_batch_id"],opRows.slice(i,i+3000),["operation_code"]);
 return {sourceRows,routingRows};
}
