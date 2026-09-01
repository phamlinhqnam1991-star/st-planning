import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { ST_OPERATION_SCOPE, LEGACY_ROUTING_SUMMARIES, OPERATION_HEADERS, MATERIAL_FINISH_HEADERS, PROCESS_REQUIREMENT_HEADERS } from "@/data/master-config";

type Obj=Record<string,unknown>;
const clean=(v:unknown)=>v==null?"":String(v).trim();
const num=(v:unknown)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null};

const recipeClean=(v:unknown)=>{
 const x=clean(v);
 return ["N/A","NA","NONE","-"].includes(x.toUpperCase())?"":x;
};

// Canonical numeric Recipe No:
// 1 -> 001, 12 -> 012, 160 -> 160.
// Non-numeric codes are preserved.
const normalizeRecipeNo=(v:unknown)=>{
 const x=recipeClean(v);
 if(!x)return "";
 return /^\d+$/.test(x)?x.padStart(3,"0"):x;
};

const catalogNoLookupKey=(family:string,group:string,no:string)=>
 `${family}|${group}|NO|${no.toUpperCase()}`;

const catalogNameLookupKey=(family:string,group:string,name:string)=>
 `${family}|${group}|NAME|${name.trim().replace(/\s+/g," ").toUpperCase()}`;

const newRecipeKey=(family:string,group:string,no:string)=>
 `${family}|${group}|${no.toUpperCase()}`;

const batchKey=(family:string,group:string,name:string)=>
 `${family}|${group}|${(name||"UNMAPPED").toUpperCase()}`;

type PaintRecipeSource={
 processFamily:string;
 recipeGroup:string;
 standardOperation:string;
 sourceSlot:string;
 sourceValue:string;
};

type RecipeCatalogItem={
 recipeKey:string;
 processFamily:string;
 recipeGroup:string;
 recipeNo:string;
 recipeName:string;
 batchKey:string;
};

function paintRecipeSourcesFromRow(o:Obj):PaintRecipeSource[]{
 // v367: Paint fallback phải bám ĐÚNG occurrence của Material Finish.
 // PRIMER2/PRIMER3 tuyệt đối không được kế thừa PRIMER1; TOPCOAT2 cũng vậy.
 // Giá trị ở các cột PRIMER1/2/3, TOPCOAT1/2 hiện là tên/cụm nhận diện Recipe,
 // vì vậy catalog sẽ resolve theo Recipe Name trước, rồi mới thử Recipe No.
 const src=[
  ["PRIMER","PRIMER","PRIMER1",recipeClean(o["PRIMER1"])],
  ["PRIMER","PRIMER2","PRIMER2",recipeClean(o["PRIMER2"])],
  ["PRIMER","PRIMER3","PRIMER3",recipeClean(o["PRIMER3"])],
  ["TOPCOAT","TOPCOAT1","TOPCOAT1",recipeClean(o["TOPCOAT1"])],
  ["TOPCOAT","TOPCOAT2","TOPCOAT2",recipeClean(o["TOPCOAT2"])],
  ["ANTI_ABRASION","ANTI-ABRASION","ANTIABRATION",recipeClean(o["ANTIABRATION"])],
  ["VARNISH","VARNISH","VarinishName",recipeClean(o["VarinishName"])],
 ] as const;

 return src
  .filter(([, , , value])=>Boolean(value))
  .map(([group,std,slot,value])=>({
    processFamily:"PAINT",
    recipeGroup:group,
    standardOperation:std,
    sourceSlot:slot,
    sourceValue:value
  }));
}



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
 // ST Scope is user-managed configuration. Master import may seed missing legacy
 // codes, but must NEVER reactivate a code the planner explicitly removed.
 if(ST_OPERATION_SCOPE.length){
  const params:string[]=[];
  const values=ST_OPERATION_SCOPE.map((x,i)=>{params.push(x);return `($${i+1},true)`}).join(",");
  await c.query(`insert into public.md_st_operation_scope(operation_code,is_active) values ${values} on conflict(operation_code) do nothing`,params);
 }
 const rows=LEGACY_ROUTING_SUMMARIES.map(x=>[x.routingCode,x.routingName,0,0,x.signature,true]);
 for(let i=0;i<rows.length;i+=1000)await upsertRows(c,"public.md_st_routing_summary",["routing_code","routing_name","operation_count","part_revision_count","routing_signature","is_active"],rows.slice(i,i+1000),["routing_code"]);
}

export async function importMasterXlsx(filePath:string,c:PoolClient,batchId:string){
 const existing=new Map<string,string>(); const old=await c.query("select part_num,revision_num,source_hash from public.md_source_snapshot"); for(const r of old.rows)existing.set(`${r.part_num}\u0001${r.revision_num}`,r.source_hash);

 // Process Recipe Master is the single source of truth for Recipe Name.
 const recipeCatalogByNo=new Map<string,RecipeCatalogItem>();
 const recipeCatalogByName=new Map<string,RecipeCatalogItem>();
 const recipeMaster=await c.query(`
   select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key
   from public.md_process_recipe
   where is_active=true
   order by
     case when source_system='MANUAL' then 0 else 1 end,
     updated_at desc
 `);
 for(const r of recipeMaster.rows){
   const no=normalizeRecipeNo(r.recipe_no);
   const name=recipeClean(r.recipe_name);
   const item:RecipeCatalogItem={
     recipeKey:r.recipe_key,
     processFamily:r.process_family,
     recipeGroup:r.recipe_group,
     recipeNo:no,
     recipeName:name,
     batchKey:clean(r.batch_key)||batchKey(r.process_family,r.recipe_group,name)
   };
   if(no){
     const k=catalogNoLookupKey(r.process_family,r.recipe_group,no);
     if(!recipeCatalogByNo.has(k))recipeCatalogByNo.set(k,item);
   }
   if(name){
     const k=catalogNameLookupKey(r.process_family,r.recipe_group,name);
     if(!recipeCatalogByName.has(k))recipeCatalogByName.set(k,item);
   }
 }
 const workbook=new ExcelJS.stream.xlsx.WorkbookReader(filePath,{worksheets:"emit",sharedStrings:"cache",styles:"ignore",hyperlinks:"ignore"});
 let sourceRows=0,routingRows=0,newRows=0,changedRows=0,unchangedRows=0; const seenOps=new Set<string>();
 let partRows:unknown[][]=[],revRows:unknown[][]=[],finishRows:unknown[][]=[],reqRows:unknown[][]=[],routeRows:unknown[][]=[],snapshotRows:unknown[][]=[],recipeRows:unknown[][]=[],opRecipeRows:unknown[][]=[],partRecipeRows:unknown[][]=[];
 const flush=async(force=false)=>{
  if(partRows.length>=1000||force){await upsertRows(c,"public.md_part",["part_num","part_description","program","part_cluster","surface_dm2","is_active","updated_at","last_import_batch_id"],partRows,["part_num"]);partRows=[]}
  if(revRows.length>=3000||force){await upsertRows(c,"public.md_part_revision",["part_num","revision_num","is_active","updated_at","last_import_batch_id"],revRows,["part_num","revision_num"]);revRows=[]}
  if(finishRows.length>=3000||force){await upsertRows(c,"public.md_material_finish",["part_num","revision_num","primer1","primer2","primer3","topcoat1","topcoat2","antiabration","primer1_name","topcoat_name","antiabrasion_name","varinish_name","alloy","temper","tsa","chemicalconv_airbus","is_active","updated_at","last_import_batch_id"],finishRows,["part_num","revision_num"]);finishRows=[]}
  if(reqRows.length>=5000||force){await upsertRows(c,"public.md_process_requirement",["part_num","revision_num","requirement_code","requirement_value","is_active","updated_at","last_import_batch_id"],reqRows,["part_num","revision_num","requirement_code"]);reqRows=[]}
  if(routeRows.length>=5000||force){await upsertRows(c,"public.md_routing_detailed",["part_num","revision_num","source_seq","operation_code","next_operation_code","operation_detail_code","operation_detail_name","is_active","updated_at","last_import_batch_id"],routeRows,["part_num","revision_num","source_seq"]);routingRows+=routeRows.length;routeRows=[]}
  if(snapshotRows.length>=3000||force){await upsertRows(c,"public.md_source_snapshot",["part_num","revision_num","source_hash","last_seen_batch_id","updated_at"],snapshotRows,["part_num","revision_num"]);snapshotRows=[]}
  if(recipeRows.length>=2000||force){await upsertRows(c,"public.md_process_recipe",["recipe_key","process_family","recipe_group","recipe_no","recipe_name","batch_key","source_system","is_active","updated_at"],recipeRows,["recipe_key"]);recipeRows=[]}
  if(opRecipeRows.length>=3000||force){await upsertRows(c,"public.md_operation_recipe_mapping",["standard_operation","recipe_key","source_slot","is_default","is_active","updated_at"],opRecipeRows,["standard_operation","recipe_key"]);opRecipeRows=[]}
  if(partRecipeRows.length>=3000||force){await upsertRows(c,"public.md_part_process_recipe",["part_num","revision_num","standard_operation","recipe_key","source_slot","source_recipe_no","source_recipe_name","is_active","updated_at","last_import_batch_id"],partRecipeRows,["part_num","revision_num","standard_operation"]);partRecipeRows=[]}
 };
 for await(const ws of workbook){let headers:string[]=[];for await(const row of ws){const vals=(row.values as unknown[]).slice(1);if(!headers.length){headers=vals.map(clean);continue}const o:Obj={};headers.forEach((h,i)=>o[h]=vals[i]);const part=clean(o.PartNum),rev=clean(o.RevisionNum);if(!part||!rev)continue;sourceRows++;
  const key=`${part}\u0001${rev}`,hash=createHash("sha256").update(headers.map(h=>clean(o[h])).join("\u001f")).digest("hex"),previous=existing.get(key);snapshotRows.push([part,rev,hash,batchId,new Date()]);
  if(previous===hash){unchangedRows++;if(sourceRows%1000===0)await flush();continue} previous==null?newRows++:changedRows++;
  await c.query("update md_routing_detailed set is_active=false,last_import_batch_id=$3,updated_at=now() where part_num=$1 and revision_num=$2",[part,rev,batchId]); await c.query("update md_process_requirement set is_active=false,last_import_batch_id=$3,updated_at=now() where part_num=$1 and revision_num=$2",[part,rev,batchId]); await c.query("update md_part_process_recipe set is_active=false,last_import_batch_id=$3,updated_at=now() where part_num=$1 and revision_num=$2",[part,rev,batchId]);
  partRows.push([part,clean(o.PartDescription)||null,clean(o.Program)||null,clean(o.PartCluster)||null,num(o["Surface (dm2)"]),true,new Date(),batchId]);revRows.push([part,rev,true,new Date(),batchId]);finishRows.push([part,rev,...MATERIAL_FINISH_HEADERS.map(h=>clean(o[h])||null),true,new Date(),batchId]);
  for(const pr of paintRecipeSourcesFromRow(o)){
   const sourceNo=normalizeRecipeNo(pr.sourceValue);
   const byName=recipeCatalogByName.get(
     catalogNameLookupKey(pr.processFamily,pr.recipeGroup,pr.sourceValue)
   );
   const byNo=sourceNo?recipeCatalogByNo.get(
     catalogNoLookupKey(pr.processFamily,pr.recipeGroup,sourceNo)
   ):undefined;
   let master=byName||byNo;

   // Chỉ auto-discover khi Master thật sự cung cấp Recipe No dạng số.
   // Với giá trị dạng tên (ví dụ "10P4-2NF Fluid Resistant Epoxy Primer"),
   // nếu Process Recipe Master chưa có thì bỏ fallback thay vì tạo một Recipe No sai.
   if(!master && /^\d+$/.test(recipeClean(pr.sourceValue))){
     const key=newRecipeKey(pr.processFamily,pr.recipeGroup,sourceNo);
     master={
       recipeKey:key,
       processFamily:pr.processFamily,
       recipeGroup:pr.recipeGroup,
       recipeNo:sourceNo,
       recipeName:"",
       batchKey:batchKey(pr.processFamily,pr.recipeGroup,"")
     };
     recipeCatalogByNo.set(catalogNoLookupKey(pr.processFamily,pr.recipeGroup,sourceNo),master);
     recipeRows.push([
       master.recipeKey,master.processFamily,master.recipeGroup,master.recipeNo,null,
       master.batchKey,"AUTO_DISCOVERED",true,new Date()
     ]);
   }
   if(!master)continue;

   opRecipeRows.push([
     pr.standardOperation,master.recipeKey,pr.sourceSlot,false,true,new Date()
   ]);

   // source_recipe_name giữ NULL: Recipe Name chuẩn luôn đọc từ md_process_recipe.
   partRecipeRows.push([
     part,rev,pr.standardOperation,master.recipeKey,pr.sourceSlot,master.recipeNo||null,null,
     true,new Date(),batchId
   ]);
  }
  for(const h of PROCESS_REQUIREMENT_HEADERS){const v=clean(o[h]);if(v)reqRows.push([part,rev,h,v,true,new Date(),batchId])}const ops=OPERATION_HEADERS.map((h,i)=>({seq:(i+1)*10,code:clean(o[h])})).filter(x=>x.code);for(const x of ops)seenOps.add(x.code);for(const x of detailOps(ops))routeRows.push([part,rev,x.seq,x.code,x.next==="END"?null:x.next,x.detailCode,x.detailName,true,new Date(),batchId]);if(sourceRows%500===0)await flush();}}
 await flush(true);
 for(const table of ["md_part_revision","md_routing_detailed","md_material_finish","md_process_requirement","md_part_process_recipe"]){await c.query(`update ${table} d set is_active=false,updated_at=now(),last_import_batch_id=$1 where d.is_active=true and not exists(select 1 from md_source_snapshot s where s.part_num=d.part_num and s.revision_num=d.revision_num and s.last_seen_batch_id=$1)`,[batchId])}
 await c.query(`update md_part p set is_active=false,updated_at=now() where p.is_active=true and not exists(select 1 from md_source_snapshot s where s.part_num=p.part_num and s.last_seen_batch_id=$1)`,[batchId]);
 const opRows=[...seenOps].map(x=>[x,x,true,new Date(),batchId]);for(let i=0;i<opRows.length;i+=3000)await upsertRows(c,"public.md_operation",["operation_code","operation_name","is_active","updated_at","last_import_batch_id"],opRows.slice(i,i+3000),["operation_code"]);
 return {sourceRows,routingRows,newRows,changedRows,unchangedRows};
}
