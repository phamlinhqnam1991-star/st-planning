import type {PoolClient} from "pg";
import {PROCESS_REQUIREMENT_HEADERS} from "@/data/master-config";
import {parseSelectionRule} from "@/lib/batch-key-recipe";

export const PROCESS_REQUIREMENT_PREFIX="MD:REQ:";

export type ProcessRequirementUsage={
 requirementCode:string;
 ruleCount:number;
 mappingIds:number[];
 operations:string[];
};

export const normalizeRequirementCode=(value:unknown)=>String(value??"").trim().replace(/\s+/g," ").toUpperCase();

const HEADER_BY_NORMALIZED=new Map(
 PROCESS_REQUIREMENT_HEADERS.map(code=>[normalizeRequirementCode(code),String(code)])
);

export function canonicalRequirementCode(value:unknown):string{
 const normalized=normalizeRequirementCode(value);
 return HEADER_BY_NORMALIZED.get(normalized)||String(value??"").trim().replace(/\s+/g," ");
}

export function extractRequirementCodesFromSelectionRule(selectionRule:unknown):string[]{
 const out=new Set<string>();
 const raw=selectionRule==null?null:String(selectionRule);
 for(const condition of parseSelectionRule(raw)){
  const column=String(condition.source_column||"").trim();
  if(!column.toUpperCase().startsWith(PROCESS_REQUIREMENT_PREFIX))continue;
  const code=column.slice(PROCESS_REQUIREMENT_PREFIX.length).trim();
  if(code)out.add(canonicalRequirementCode(code));
 }
 return [...out];
}

export async function loadRecipeRequirementUsage(c:PoolClient):Promise<ProcessRequirementUsage[]>{
 const q=await c.query(`
  select mapping_id,operation_code,selection_rule
  from public.md_main_operation_recipe
  where is_active=true
    and selection_rule is not null
    and upper(selection_rule) like '%MD:REQ:%'
  order by mapping_id
 `);
 const map=new Map<string,ProcessRequirementUsage>();
 for(const row of q.rows){
  for(const code of extractRequirementCodesFromSelectionRule(row.selection_rule)){
   const key=normalizeRequirementCode(code);
   const current=map.get(key)||{requirementCode:canonicalRequirementCode(code),ruleCount:0,mappingIds:[],operations:[]};
   current.ruleCount+=1;
   const mappingId=Number(row.mapping_id);
   if(Number.isFinite(mappingId)&&!current.mappingIds.includes(mappingId))current.mappingIds.push(mappingId);
   const operation=String(row.operation_code??"").trim();
   if(operation&&!current.operations.includes(operation))current.operations.push(operation);
   map.set(key,current);
  }
 }
 return [...map.values()].sort((a,b)=>a.requirementCode.localeCompare(b.requirementCode));
}

export async function loadManualProcessRequirementKeepCodes(c:PoolClient):Promise<string[]>{
 try{
  const q=await c.query(`
   select requirement_code
   from public.md_process_requirement_keep
   where is_active=true
   order by requirement_code
  `);
  return q.rows.map((row:any)=>canonicalRequirementCode(row.requirement_code)).filter(Boolean);
 }catch(error:any){
  // Migration 069 may not have been applied yet. Rules-only filtering remains safe.
  if(error?.code==="42P01")return [];
  throw error;
 }
}

export async function loadEffectiveProcessRequirementCodes(c:PoolClient){
 const [usage,manualKeep]=await Promise.all([
  loadRecipeRequirementUsage(c),
  loadManualProcessRequirementKeepCodes(c),
 ]);
 const effective=new Map<string,string>();
 for(const item of usage)effective.set(normalizeRequirementCode(item.requirementCode),canonicalRequirementCode(item.requirementCode));
 for(const code of manualKeep)effective.set(normalizeRequirementCode(code),canonicalRequirementCode(code));
 const importable=[...effective.values()].filter(code=>HEADER_BY_NORMALIZED.has(normalizeRequirementCode(code)));
 const unknown=[...effective.values()].filter(code=>!HEADER_BY_NORMALIZED.has(normalizeRequirementCode(code)));
 return {
  usage,
  manualKeep,
  effectiveCodes:[...effective.values()].sort((a,b)=>a.localeCompare(b)),
  importableCodes:importable.sort((a,b)=>a.localeCompare(b)),
  unknownCodes:unknown.sort((a,b)=>a.localeCompare(b)),
 };
}

export function isImportableProcessRequirementCode(code:unknown):boolean{
 return HEADER_BY_NORMALIZED.has(normalizeRequirementCode(code));
}
