import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase();
const number=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const action=upper(body.action);
 const c=await getPool().connect();
 try{
  if(action==="SAVE_TOTAL"){
   const total=number(body.total_people);if(total==null)return NextResponse.json({error:"Total People phải >= 0."},{status:400});
   await c.query(`
    insert into public.md_masking_team_setting(setting_key,total_people,updated_at)
    values('DEFAULT',$1,now())
    on conflict(setting_key) do update set total_people=excluded.total_people,updated_at=now()
   `,[total]);
   return NextResponse.json({ok:true,total_people:total});
  }
  if(action==="SAVE_AREA"){
   const areaCode=clean(body.area_code);const people=number(body.allocated_people);
   if(!areaCode)return NextResponse.json({error:"Thiếu Physical Area."},{status:400});
   if(people==null)return NextResponse.json({error:"Allocated People phải >= 0."},{status:400});
   const exists=await c.query(`select 1 from public.md_area where area_code=$1 and is_active=true limit 1`,[areaCode]);
   if(!exists.rowCount)return NextResponse.json({error:"Physical Area không tồn tại hoặc đã ngưng."},{status:400});
   await c.query(`
    insert into public.md_masking_area_manpower(area_code,allocated_people,is_active,updated_at)
    values($1,$2,true,now())
    on conflict(area_code) do update set allocated_people=excluded.allocated_people,is_active=true,updated_at=now()
   `,[areaCode,people]);
   return NextResponse.json({ok:true,area_code:areaCode,allocated_people:people});
  }
  if(action==="DELETE_AREA"){
   const areaCode=clean(body.area_code);if(!areaCode)return NextResponse.json({error:"Thiếu Physical Area."},{status:400});
   await c.query(`update public.md_masking_area_manpower set is_active=false,updated_at=now() where area_code=$1`,[areaCode]);
   return NextResponse.json({ok:true});
  }
  if(action==="SAVE_MAPPING"){
   const id=Number(body.id||0);
   const standardOperation=clean(body.standard_operation);
   const sourceColumn=clean(body.source_column);
   const areaCode=clean(body.area_code);
   const timeBasis=upper(body.time_basis)==="PER_PIECE"?"PER_PIECE":"JOB_TOTAL";
   const valueUnit=upper(body.value_unit)==="MINUTES"?"MINUTES":"HOURS";
   const sortOrder=Number.isFinite(Number(body.sort_order))?Number(body.sort_order):100;
   if(!standardOperation||!sourceColumn||!areaCode)return NextResponse.json({error:"Main Operation, Masking Time Column và Physical Area là bắt buộc."},{status:400});
   const [mainQ,areaQ,columnQ]=await Promise.all([
    c.query(`select 1 from public.md_operation_master where upper(trim(standard_operation))=upper(trim($1::text)) and is_active=true limit 1`,[standardOperation]),
    c.query(`select 1 from public.md_area where area_code=$1 and is_active=true limit 1`,[areaCode]),
    c.query(`select 1 from public.md_open_job_column_value where source_column=$1 limit 1`,[sourceColumn])
   ]);
   if(!mainQ.rowCount)return NextResponse.json({error:"Main Operation không tồn tại hoặc đã ngưng."},{status:400});
   if(!areaQ.rowCount)return NextResponse.json({error:"Physical Area không tồn tại hoặc đã ngưng."},{status:400});
   if(!columnQ.rowCount)return NextResponse.json({error:"Cột này chưa có trong Open Job Column Values. Hãy rebuild danh sách cột trước."},{status:400});
   if(id>0){
    await c.query(`
     update public.md_main_masking_time_column
     set standard_operation=$2,source_column=$3,area_code=$4,time_basis=$5,value_unit=$6,sort_order=$7,is_active=true,updated_at=now()
     where id=$1
    `,[id,standardOperation,sourceColumn,areaCode,timeBasis,valueUnit,sortOrder]);
   }else{
    await c.query(`
     insert into public.md_main_masking_time_column(standard_operation,source_column,area_code,time_basis,value_unit,sort_order,is_active,updated_at)
     values($1,$2,$3,$4,$5,$6,true,now())
     on conflict(standard_operation,source_column)
     do update set area_code=excluded.area_code,time_basis=excluded.time_basis,value_unit=excluded.value_unit,sort_order=excluded.sort_order,is_active=true,updated_at=now()
    `,[standardOperation,sourceColumn,areaCode,timeBasis,valueUnit,sortOrder]);
   }
   return NextResponse.json({ok:true});
  }
  if(action==="DELETE_MAPPING"){
   const id=Number(body.id||0);if(!id)return NextResponse.json({error:"Thiếu Mapping ID."},{status:400});
   await c.query(`update public.md_main_masking_time_column set is_active=false,updated_at=now() where id=$1`,[id]);
   return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Action không hợp lệ."},{status:400});
 }catch(e){
  const code=String((e as {code?:unknown})?.code||"");
  if(code==="42P01")return NextResponse.json({error:"Chưa chạy migration 088_masking_time_estimate_advisory.sql trên Aiven."},{status:409});
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}
