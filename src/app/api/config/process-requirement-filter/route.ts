import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {PROCESS_REQUIREMENT_HEADERS} from "@/data/master-config";
import {
 canonicalRequirementCode,
 isImportableProcessRequirementCode,
 loadEffectiveProcessRequirementCodes,
 normalizeRequirementCode,
} from "@/lib/process-requirement-filter";

const clean=(value:unknown)=>String(value??"").trim();

async function readState(){
 const c=await getPool().connect();
 try{
  const filter=await loadEffectiveProcessRequirementCodes(c);
  const [statsQ,migrationQ]=await Promise.all([
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
  ]);
  const usageByCode=new Map(filter.usage.map(item=>[normalizeRequirementCode(item.requirementCode),item]));
  const keepSet=new Set(filter.manualKeep.map(normalizeRequirementCode));
  const effectiveSet=new Set(filter.importableCodes.map(normalizeRequirementCode));
  return {
   migrationInstalled:Boolean(migrationQ.rows[0]?.installed),
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
   effectiveCodes:filter.importableCodes,
   unknownCodes:filter.unknownCodes,
   stats:statsQ.rows[0]||{estimated_rows:0,total_bytes:0,table_bytes:0,index_bytes:0},
  };
 }finally{c.release();}
}

export async function GET(){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{return NextResponse.json(await readState(),{headers:{"Cache-Control":"private, no-store"}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}

export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const body=await req.json().catch(()=>({}));
  const requirementCode=canonicalRequirementCode(clean(body.requirementCode));
  const keep=Boolean(body.keep);
  if(!requirementCode||!isImportableProcessRequirementCode(requirementCode))
   return NextResponse.json({error:"Requirement Code is not one of the 38 Process Requirement columns supported by Master Import."},{status:400});
  const c=await getPool().connect();
  try{
   const installed=await c.query(`select to_regclass('public.md_process_requirement_keep') is not null installed`);
   if(!installed.rows[0]?.installed)
    return NextResponse.json({error:"Migration 069_process_requirement_filtered_import.sql has not been applied."},{status:409});
   await c.query(`
    insert into public.md_process_requirement_keep(requirement_code,is_active,updated_at)
    values($1,$2,now())
    on conflict(requirement_code) do update set is_active=excluded.is_active,updated_at=now()
   `,[requirementCode,keep]);
  }finally{c.release();}
  return NextResponse.json(await readState());
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}
