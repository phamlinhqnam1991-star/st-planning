import ExcelJS from "exceljs";
import type {PoolClient} from "pg";
import {
 canonicalRequirementCode,
 loadEffectiveProcessRequirementCodes,
 normalizeRequirementCode,
 normalizeRequirementValue,
 type ProcessRequirementGateRule,
} from "@/lib/process-requirement-filter";

const clean=(value:unknown)=>String(value??"").trim();
const normalizeHeader=(value:unknown)=>clean(value).replace(/\s+/g," ").toUpperCase();

type RequirementRow=[part:string,revision:string,code:string,value:string];

type GateLookup={rule:ProcessRequirementGateRule;columnIndex:number};
type RequirementLookup={code:string;columnIndex:number};

export type ProcessRequirementRebuildResult={
 sourceRows:number;
 passedParts:number;
 gateSkippedParts:number;
 requirementRows:number;
 blankValuesSkipped:number;
 duplicateRowsCollapsed:number;
 effectiveCodes:string[];
 gateRules:{requirementCode:string;blockedValues:string[]}[];
 missingRequirementColumns:string[];
 worksheetNames:string[];
 beforeBytes:number;
 afterBytes:number;
 durationMs:number;
};

async function insertChunk(c:PoolClient,rows:RequirementRow[]){
 if(!rows.length)return {inserted:0,collapsed:0};
 const dedup=new Map<string,RequirementRow>();
 for(const row of rows){
  dedup.set(`${row[0]}\u0001${row[1]}\u0001${normalizeRequirementCode(row[2])}`,row);
 }
 const batch=[...dedup.values()];
 const params:unknown[]=[];
 let p=1;
 const values=batch.map(row=>{
  params.push(row[0],row[1],row[2],row[3]);
  const start=p;
  p+=4;
  return `($${start},$${start+1},$${start+2},$${start+3},true,now(),null)`;
 }).join(",");
 await c.query(`
  insert into public.md_process_requirement(
   part_num,revision_num,requirement_code,requirement_value,is_active,updated_at,last_import_batch_id
  ) values ${values}
  on conflict(part_num,revision_num,requirement_code) do update set
   requirement_value=excluded.requirement_value,
   is_active=true,
   updated_at=now(),
   last_import_batch_id=null
 `,params);
 return {inserted:batch.length,collapsed:rows.length-batch.length};
}

/**
 * Lightweight Process Requirement-only rebuild.
 *
 * IMPORTANT:
 * - Does NOT rebuild Part, Material Finish, Routing, Recipe, Auto Bridge or Planning Chain.
 * - Reads only PartNum, RevisionNum, active Gate columns and effective Requirement columns.
 * - TRUNCATE happens only after the first valid data row is found, so an empty/invalid file
 *   cannot wipe the existing table.
 * - TRUNCATE is intentionally committed immediately (no long transaction) so PostgreSQL can
 *   release the old large table/index files before the smaller filtered dataset is inserted.
 *   If a later insert fails, rerun the same rebuild to reconstruct the table from the Master file.
 */
export async function rebuildProcessRequirementsOnly(filePath:string,c:PoolClient):Promise<ProcessRequirementRebuildResult>{
 const started=Date.now();
 const filter=await loadEffectiveProcessRequirementCodes(c);
 const activeGates=filter.gateRules.filter(rule=>rule.isActive&&rule.blockedValues.length>0);
 const effectiveCodes=filter.importableCodes.map(canonicalRequirementCode);
 const beforeQ=await c.query(`select pg_total_relation_size('public.md_process_requirement')::bigint bytes`);
 const beforeBytes=Number(beforeQ.rows[0]?.bytes||0);

 // Keep each statement short. The full rebuild is intentionally a sequence of small writes.
 await c.query(`set statement_timeout='45s'`);
 await c.query(`set lock_timeout='15s'`);

 const workbook=new ExcelJS.stream.xlsx.WorkbookReader(filePath,{
  worksheets:"emit",sharedStrings:"cache",styles:"ignore",hyperlinks:"ignore"
 });

 let sourceRows=0;
 let passedParts=0;
 let gateSkippedParts=0;
 let requirementRows=0;
 let blankValuesSkipped=0;
 let duplicateRowsCollapsed=0;
 let truncated=false;
 let foundValidWorksheet=false;
 const worksheetNames:string[]=[];
 const missingRequirementColumns=new Set<string>();
 let pending:RequirementRow[]=[];

 const flush=async(force=false)=>{
  if(!pending.length)return;
  if(pending.length<3000&&!force)return;
  const rows=pending;
  pending=[];
  const result=await insertChunk(c,rows);
  requirementRows+=result.inserted;
  duplicateRowsCollapsed+=result.collapsed;
 };

 for await(const ws of workbook){
  let initialized=false;
  let partIndex=-1;
  let revisionIndex=-1;
  let gateLookups:GateLookup[]=[];
  let requirementLookups:RequirementLookup[]=[];
  let usableSheet=false;

  for await(const row of ws){
   if(!initialized){
    initialized=true;
    const values=(row.values as unknown[]).slice(1);
    const headerIndex=new Map<string,number>();
    values.forEach((value,index)=>{
     const key=normalizeHeader(value);
     if(key&&!headerIndex.has(key))headerIndex.set(key,index+1); // ExcelJS cell index is 1-based.
    });
    partIndex=headerIndex.get(normalizeHeader("PartNum"))??-1;
    revisionIndex=headerIndex.get(normalizeHeader("RevisionNum"))??-1;
    if(partIndex<1||revisionIndex<1)continue;

    gateLookups=activeGates.map(rule=>({
     rule,
     columnIndex:headerIndex.get(normalizeHeader(canonicalRequirementCode(rule.requirementCode)))??-1,
    }));
    const missingGate=gateLookups.filter(item=>item.columnIndex<1).map(item=>item.rule.requirementCode);
    if(missingGate.length){
     throw new Error(`Master Excel thiếu cột Gate Requirement: ${missingGate.join(", ")}. Không xóa dữ liệu cũ.`);
    }

    requirementLookups=[];
    for(const code of effectiveCodes){
     const columnIndex=headerIndex.get(normalizeHeader(code))??-1;
     if(columnIndex<1){missingRequirementColumns.add(code);continue;}
     requirementLookups.push({code,columnIndex});
    }
    usableSheet=true;
    foundValidWorksheet=true;
    worksheetNames.push(String((ws as any).name||"Master"));
    continue;
   }
   if(!usableSheet)continue;

   const part=clean(row.getCell(partIndex).value);
   const revision=clean(row.getCell(revisionIndex).value);
   if(!part||!revision)continue;

   // Do not TRUNCATE until we know the workbook contains at least one valid Part/Revision row.
   if(!truncated){
    await c.query(`truncate table public.md_process_requirement`);
    truncated=true;
   }

   sourceRows++;
   let blocked=false;
   for(const lookup of gateLookups){
    const value=normalizeRequirementValue(row.getCell(lookup.columnIndex).value);
    if(value&&lookup.rule.blockedValues.includes(value)){
     blocked=true;
     break;
    }
   }
   if(blocked){
    gateSkippedParts++;
    continue;
   }

   passedParts++;
   for(const lookup of requirementLookups){
    const value=clean(row.getCell(lookup.columnIndex).value);
    if(!value){blankValuesSkipped++;continue;}
    pending.push([part,revision,lookup.code,value]);
   }
   await flush(false);
  }
 }

 if(!foundValidWorksheet)throw new Error("Không tìm thấy worksheet có cột PartNum và RevisionNum. Không xóa dữ liệu cũ.");
 if(!sourceRows||!truncated)throw new Error("Master Excel không có dòng Part/Revision hợp lệ. Không xóa dữ liệu cũ.");
 await flush(true);
 await c.query(`analyze public.md_process_requirement`);
 const afterQ=await c.query(`select pg_total_relation_size('public.md_process_requirement')::bigint bytes`);
 const afterBytes=Number(afterQ.rows[0]?.bytes||0);

 return {
  sourceRows,
  passedParts,
  gateSkippedParts,
  requirementRows,
  blankValuesSkipped,
  duplicateRowsCollapsed,
  effectiveCodes,
  gateRules:activeGates.map(rule=>({requirementCode:rule.requirementCode,blockedValues:rule.blockedValues})),
  missingRequirementColumns:[...missingRequirementColumns].sort((a,b)=>a.localeCompare(b)),
  worksheetNames,
  beforeBytes,
  afterBytes,
  durationMs:Date.now()-started,
 };
}
