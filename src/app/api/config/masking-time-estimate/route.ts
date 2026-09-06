import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase();
const number=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e??"Unknown database error");

type SafeRows<T=Record<string,unknown>>={rows:T[];error:string};
async function safeRows<T=Record<string,unknown>>(c:{query:(sql:string,params?:unknown[])=>Promise<{rows:T[]}>},sql:string,params?:unknown[]):Promise<SafeRows<T>>{
 try{
  const q=await c.query(sql,params);
  return {rows:q.rows,error:""};
 }catch(e){
  return {rows:[],error:errorText(e)};
 }
}

/**
 * V514 fail-safe loader.
 * The page shell no longer depends on these queries.  Any individual source
 * may fail and the client still receives a renderable payload + diagnostics.
 */
export async function GET(){
 try{
  const {denied}=await requireApiPermission("config.view");
  if(denied)return denied;
 }catch(e){
  return NextResponse.json({
   ok:false,migrationReady:false,warnings:[`Không kiểm tra được quyền truy cập: ${errorText(e)}`],
   totalPeople:0,areas:[],mains:[],columns:[],allocations:[],mappings:[]
  },{status:503});
 }

 const warnings:string[]=[];
 let migrationReady=false;
 let totalPeople=0;
 let areas:Record<string,unknown>[]=[];
 let mains:Record<string,unknown>[]=[];
 let columns:Record<string,unknown>[]=[];
 let allocations:Record<string,unknown>[]=[];
 let mappings:Record<string,unknown>[]=[];
 let c:any=null;
 try{
  c=await getPool().connect();

  const schema=await safeRows<any>(c,`select
    to_regclass('public.md_masking_team_setting') is not null as team_ready,
    to_regclass('public.md_masking_area_manpower') is not null as area_ready,
    to_regclass('public.md_main_masking_time_column') is not null as mapping_ready`);
  if(schema.error){
   warnings.push(`Không kiểm tra được schema Masking Estimate: ${schema.error}`);
  }else{
   const s=schema.rows[0]||{};
   migrationReady=Boolean(s.team_ready&&s.area_ready&&s.mapping_ready);
   if(!migrationReady)warnings.push("Schema V512 chưa đầy đủ. Hãy chạy đủ 4 query Masking Estimate trên Aiven.");
  }

  let areaQ=await safeRows<any>(c,`select area_code,area_name,coalesce(sort_order,0) sort_order
    from public.md_area where coalesce(is_active,true)=true
    order by coalesce(sort_order,0),area_name`);
  if(areaQ.error){
   // Older area master may not have sort_order.
   areaQ=await safeRows<any>(c,`select area_code,area_name,0::integer sort_order
     from public.md_area where coalesce(is_active,true)=true order by area_name`);
  }
  if(areaQ.error)warnings.push(`Không đọc được Physical Area: ${areaQ.error}`); else areas=areaQ.rows;

  let mainQ=await safeRows<any>(c,`select standard_operation,planning_sort_order
    from public.md_operation_master where coalesce(is_active,true)=true
    order by planning_sort_order nulls last,standard_operation`);
  if(mainQ.error){
   mainQ=await safeRows<any>(c,`select standard_operation,null::integer planning_sort_order
     from public.md_operation_master where coalesce(is_active,true)=true order by standard_operation`);
   if(!mainQ.error)warnings.push("Main Operation đang dùng thứ tự alphabet vì DB chưa có planning_sort_order.");
  }
  if(mainQ.error)warnings.push(`Không đọc được Main Operation: ${mainQ.error}`); else mains=mainQ.rows;

  const columnQ=await safeRows<any>(c,`select distinct source_column
    from public.md_open_job_column_value
    where coalesce(is_active,true)=true and nullif(trim(source_column),'') is not null
    order by case when upper(source_column) like '%MASK%' then 0 else 1 end,source_column`);
  if(columnQ.error)warnings.push(`Không đọc được Open Job Column Values: ${columnQ.error}`); else columns=columnQ.rows;

  if(migrationReady){
   const totalQ=await safeRows<any>(c,`select total_people from public.md_masking_team_setting where setting_key='DEFAULT' limit 1`);
   if(totalQ.error)warnings.push(`Không đọc được Total Masking People: ${totalQ.error}`); else totalPeople=Number(totalQ.rows[0]?.total_people||0);

   let allocQ=await safeRows<any>(c,`select p.area_code,coalesce(a.area_name,p.area_code) area_name,p.allocated_people
      from public.md_masking_area_manpower p
      left join public.md_area a on a.area_code=p.area_code
      where coalesce(p.is_active,true)=true
      order by coalesce(a.sort_order,999999),coalesce(a.area_name,p.area_code)`);
   if(allocQ.error){
    // Do not let an older md_area without sort_order hide already-saved manpower.
    allocQ=await safeRows<any>(c,`select p.area_code,coalesce(a.area_name,p.area_code) area_name,p.allocated_people
      from public.md_masking_area_manpower p
      left join public.md_area a on a.area_code=p.area_code
      where coalesce(p.is_active,true)=true
      order by coalesce(a.area_name,p.area_code)`);
   }
   if(allocQ.error)warnings.push(`Không đọc được Masking manpower theo Area: ${allocQ.error}`); else allocations=allocQ.rows;

   const mapQ=await safeRows<any>(c,`select m.id,m.standard_operation,m.source_column,m.area_code,
      coalesce(a.area_name,m.area_code) area_name,m.time_basis,m.value_unit,m.sort_order
      from public.md_main_masking_time_column m
      left join public.md_area a on a.area_code=m.area_code
      where coalesce(m.is_active,true)=true
      order by upper(trim(m.standard_operation)),m.sort_order,m.id`);
   if(mapQ.error)warnings.push(`Không đọc được Main → Masking Time Column mapping: ${mapQ.error}`); else mappings=mapQ.rows;
  }
 }catch(e){
  warnings.push(`Không kết nối/đọc được cấu hình Masking Estimate: ${errorText(e)}`);
 }finally{
  c?.release();
 }

 return NextResponse.json({ok:true,migrationReady,warnings,totalPeople,areas,mains,columns,allocations,mappings},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:Request){
 try{
  const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 }catch(e){
  return NextResponse.json({error:`Không kiểm tra được quyền cấu hình: ${errorText(e)}`},{status:503});
 }
 const body=await req.json().catch(()=>({}));
 const action=upper(body.action);
 let c:any=null;
 try{
  c=await getPool().connect();
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
   const exists=await c.query(`select 1 from public.md_area where area_code=$1 and coalesce(is_active,true)=true limit 1`,[areaCode]);
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
   // Keep these reads sequential on the same client. Aiven/Vercel commonly runs DB_POOL_MAX=1.
   const mainQ=await c.query(`select 1 from public.md_operation_master where upper(trim(standard_operation))=upper(trim($1::text)) and coalesce(is_active,true)=true limit 1`,[standardOperation]);
   const areaQ=await c.query(`select 1 from public.md_area where area_code=$1 and coalesce(is_active,true)=true limit 1`,[areaCode]);
   const columnQ=await c.query(`select 1 from public.md_open_job_column_value where source_column=$1 limit 1`,[sourceColumn]);
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
  if(code==="42P01")return NextResponse.json({error:"Chưa chạy đủ 4 query Masking Estimate V512 trên Aiven."},{status:409});
  return NextResponse.json({error:errorText(e)},{status:400});
 }finally{c?.release();}
}
