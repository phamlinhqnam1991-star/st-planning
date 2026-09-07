import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {PROCESS_REQUIREMENT_HEADERS} from "@/data/master-config";
import {
 canonicalRequirementCode,
 isImportableProcessRequirementCode,
 loadEffectiveProcessRequirementCodes,
 normalizeRequirementCode,
 normalizeRequirementValue,
} from "@/lib/process-requirement-filter";

const clean=(value:unknown)=>String(value??"").trim();

async function readState(){
 const c=await getPool().connect();
 try{
  const filter=await loadEffectiveProcessRequirementCodes(c);
  const [statsQ,migrationQ,gateMigrationQ]=await Promise.all([
   c.query(`
    select
      coalesce(s.n_live_tup,0)::bigint estimated_rows,
      pg_total_relation_size('public.md_process_requirement')::bigint total_bytes,
      pg_relation_size('public.md_process_requirement')::bigint table_bytes,
      pg_indexes_size('public.md_process_requirement')::bigint index_bytes
    from pg_stat_user_tables s
    where s.schemaname='public' and s.relname='md_process_requirement'
   `),
   c.query(`select to_regclass('public.md_process_requirement_keep') is not null installed`),
   c.query(`select to_regclass('public.md_process_requirement_gate_rule') is not null installed`),
  ]);
  const usageByCode=new Map(filter.usage.map(item=>[normalizeRequirementCode(item.requirementCode),item]));
  const keepSet=new Set(filter.manualKeep.map(normalizeRequirementCode));
  const effectiveSet=new Set(filter.importableCodes.map(normalizeRequirementCode));
  return {
   migrationInstalled:Boolean(migrationQ.rows[0]?.installed),
   gateMigrationInstalled:Boolean(gateMigrationQ.rows[0]?.installed),
   requirements:PROCESS_REQUIREMENT_HEADERS.map(code=>{
    const usage=usageByCode.get(normalizeRequirementCode(code));
    return {
     requirementCode:String(code),
     ruleCount:usage?.ruleCount||0,
     mappingIds:usage?.mappingIds||[],
     operations:usage?.operations||[],
     manualKeep:keepSet.has(normalizeRequirementCode(code)),
     willImport:effectiveSet.has(normalizeRequirementCode(code)),
    };
   }),
   gateRules:filter.gateRules,
   effectiveCodes:filter.importableCodes,
   unknownCodes:filter.unknownCodes,
   stats:statsQ.rows[0]||{estimated_rows:0,total_bytes:0,table_bytes:0,index_bytes:0},
  };
 }finally{c.release();}
}

export async function GET(){
 const {denied}=await requireApiPermission("config.view");
 if(denied)return denied;
 try{return NextResponse.json(await readState(),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");
 if(denied)return denied;
 try{
  const body=await req.json().catch(()=>({}));
  const action=clean(body.action).toUpperCase()||"KEEP";
  const requirementCode=canonicalRequirementCode(clean(body.requirementCode));
  if(!requirementCode||!isImportableProcessRequirementCode(requirementCode))
   return NextResponse.json({error:"Requirement Code is not one of the 38 Process Requirement columns supported by Master Import."},{status:400});

  const c=await getPool().connect();
  try{
   if(action==="GATE"){
    const installed=await c.query(`select to_regclass('public.md_process_requirement_gate_rule') is not null installed`);
    if(!installed.rows[0]?.installed)
     return NextResponse.json({error:"Migration 070_process_requirement_part_gate.sql has not been applied."},{status:409});
    const blockedValues=(Array.isArray(body.blockedValues)?body.blockedValues:String(body.blockedValues??"").split(","))
     .map(normalizeRequirementValue).filter(Boolean);
    const uniqueValues=[...new Set(blockedValues)];
    if(!uniqueValues.length)
     return NextResponse.json({error:"At least one blocked value is required for an active Gate Rule."},{status:400});
    const enabled=body.enabled!==false;
    const note=clean(body.note)||null;
    await c.query(`
     insert into public.md_process_requirement_gate_rule(requirement_code,blocked_values,is_active,note,updated_at)
     values($1,$2::text[],$3,$4,now())
     on conflict(requirement_code) do update set
      blocked_values=excluded.blocked_values,
      is_active=excluded.is_active,
      note=excluded.note,
      updated_at=now()
    `,[requirementCode,uniqueValues,enabled,note]);
   }else{
    const keep=Boolean(body.keep);
    const installed=await c.query(`select to_regclass('public.md_process_requirement_keep') is not null installed`);
    if(!installed.rows[0]?.installed)
     return NextResponse.json({error:"Migration 069_process_requirement_filtered_import.sql has not been applied."},{status:409});
    await c.query(`
     insert into public.md_process_requirement_keep(requirement_code,is_active,updated_at)
     values($1,$2,now())
     on conflict(requirement_code) do update set is_active=excluded.is_active,updated_at=now()
    `,[requirementCode,keep]);
   }
  }finally{c.release();}
  return NextResponse.json(await readState());
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}
