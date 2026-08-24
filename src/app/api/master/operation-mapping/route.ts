import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const RULES=["DIRECT","OCCURRENCE","SEQUENCE","SEQUENCE/FALLBACK"];
const clean=(v:unknown)=>String(v??"").trim();

async function syncOperationMaster(client:any){
  // md_st_operation_mapping is the upstream configuration source.
  // DIRECT mappings represent one concrete Standard Operation and must be
  // available in Operation Master so Area/Schedule Area can consume them.
  //
  // If a Standard Operation was moved to another ST Group, the newest active
  // mapping wins. Time-rule columns in md_operation_master are preserved.
  await client.query(`
   with latest_direct as (
    select distinct on (upper(trim(standard_operation_rule)))
      trim(standard_operation_rule) standard_operation,
      trim(st_group) st_group
    from md_st_operation_mapping
    where is_active=true
      and mapping_rule='DIRECT'
      and nullif(trim(standard_operation_rule),'') is not null
    order by
      upper(trim(standard_operation_rule)),
      updated_at desc,
      id desc
   )
   insert into md_operation_master(
    standard_operation,
    st_group,
    is_active
   )
   select
    standard_operation,
    st_group,
    true
   from latest_direct
   on conflict(standard_operation)
   do update set
    st_group=excluded.st_group,
    is_active=true,
    updated_at=now()
  `);
}

async function refresh(client:any){
  await syncOperationMaster(client);
  await client.query("select public.refresh_st_operation_mapping(null)");
}

export async function POST(req:NextRequest){
  try{
    const user={email:"system"}; const b=await req.json();
    const stGroup=clean(b.st_group), source=clean(b.source_operation_code).toUpperCase();
    const label=clean(b.source_label)||source, standard=clean(b.standard_operation_rule), rule=clean(b.mapping_rule).toUpperCase();
    if(!stGroup||!source||!standard||!RULES.includes(rule)) return NextResponse.json({error:"Thiếu hoặc sai dữ liệu mapping."},{status:400});
    const c=await getPool().connect();
    try{
      await c.query("begin");
      // One active source operation belongs to one ST group. Old active mapping is deactivated, never deleted.
      const old=await c.query("select * from md_st_operation_mapping where upper(trim(source_operation_code))=$1 and is_active for update",[source]);
      for(const r of old.rows){
        await c.query("update md_st_operation_mapping set is_active=false,updated_at=now() where id=$1",[r.id]);
        await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,old_st_group,new_st_group,old_standard_operation_rule,new_standard_operation_rule,old_mapping_rule,new_mapping_rule,changed_by)
          values($1,'MOVE',$2,$3,$4,$5,$6,$7,$8,$9)`,[r.id,source,r.st_group,stGroup,r.standard_operation_rule,standard,r.mapping_rule,rule,user.email||null]);
      }
      const same=await c.query(`select id from md_st_operation_mapping where upper(trim(source_operation_code))=$1 and st_group=$2 and standard_operation_rule=$3 limit 1`,[source,stGroup,standard]);
      let id:number;
      if(same.rowCount){
        id=same.rows[0].id;
        await c.query(`update md_st_operation_mapping set source_label=$2,mapping_rule=$3,is_active=true,updated_at=now() where id=$1`,[id,label,rule]);
      }else{
        const max=await c.query("select coalesce(max(sort_order),0)+1 n from md_st_operation_mapping");
        const ins=await c.query(`insert into md_st_operation_mapping(sort_order,st_group,source_operation_code,source_label,standard_operation_rule,mapping_rule,is_active)
          values($1,$2,$3,$4,$5,$6,true) returning id`,[max.rows[0].n,stGroup,source,label,standard,rule]); id=ins.rows[0].id;
      }
      await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,new_st_group,new_standard_operation_rule,new_mapping_rule,changed_by)
        values($1,'ADD',$2,$3,$4,$5,$6)`,[id,source,stGroup,standard,rule,user.email||null]);
      await refresh(c); await c.query("commit");
      return NextResponse.json({ok:true,id});
    }catch(e){await c.query("rollback");throw e}finally{c.release()}
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function PATCH(req:NextRequest){
  try{
    const user={email:"system"}; const b=await req.json(); const id=Number(b.id);
    if(!id) return NextResponse.json({error:"Mapping id không hợp lệ."},{status:400});
    const c=await getPool().connect();
    try{
      await c.query("begin");
      const oldQ=await c.query("select * from md_st_operation_mapping where id=$1 for update",[id]); if(!oldQ.rowCount) throw new Error("Không tìm thấy mapping.");
      const old=oldQ.rows[0], stGroup=clean(b.st_group), label=clean(b.source_label)||old.source_operation_code, standard=clean(b.standard_operation_rule), rule=clean(b.mapping_rule).toUpperCase();
      if(!stGroup||!standard||!RULES.includes(rule)) throw new Error("Dữ liệu mapping không hợp lệ.");
      if(stGroup!==old.st_group){
        await c.query("update md_st_operation_mapping set is_active=false,updated_at=now() where upper(trim(source_operation_code))=upper(trim($1)) and id<>$2 and is_active",[old.source_operation_code,id]);
      }
      await c.query(`update md_st_operation_mapping set st_group=$2,source_label=$3,standard_operation_rule=$4,mapping_rule=$5,is_active=true,updated_at=now() where id=$1`,[id,stGroup,label,standard,rule]);
      await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,old_st_group,new_st_group,old_standard_operation_rule,new_standard_operation_rule,old_mapping_rule,new_mapping_rule,changed_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,stGroup===old.st_group?"UPDATE":"MOVE",old.source_operation_code,old.st_group,stGroup,old.standard_operation_rule,standard,old.mapping_rule,rule,user.email||null]);
      await refresh(c); await c.query("commit"); return NextResponse.json({ok:true});
    }catch(e){await c.query("rollback");throw e}finally{c.release()}
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function DELETE(req:NextRequest){
  try{
    const user={email:"system"}; const b=await req.json(); const id=Number(b.id);
    const c=await getPool().connect();
    try{
      await c.query("begin");
      const oldQ=await c.query("select * from md_st_operation_mapping where id=$1 for update",[id]); if(!oldQ.rowCount) throw new Error("Không tìm thấy mapping.");
      const old=oldQ.rows[0];
      await c.query("update md_st_operation_mapping set is_active=false,updated_at=now() where id=$1",[id]);
      await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,old_st_group,old_standard_operation_rule,old_mapping_rule,changed_by)
        values($1,'DEACTIVATE',$2,$3,$4,$5,$6)`,[id,old.source_operation_code,old.st_group,old.standard_operation_rule,old.mapping_rule,user.email||null]);
      await refresh(c); await c.query("commit"); return NextResponse.json({ok:true});
    }catch(e){await c.query("rollback");throw e}finally{c.release()}
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
