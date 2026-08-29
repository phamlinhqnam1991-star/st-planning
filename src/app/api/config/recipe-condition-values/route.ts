import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const MASTER_COLUMNS:Record<string,{table:string;column:string}>={
 "MD:ALLOY":{table:"md_material_finish",column:"alloy"},"MD:TEMPER":{table:"md_material_finish",column:"temper"},"MD:TSA":{table:"md_material_finish",column:"tsa"},"MD:CHEMCONV_AIRBUS":{table:"md_material_finish",column:"chemicalconv_airbus"},"MD:PRIMER1":{table:"md_material_finish",column:"primer1"},"MD:PRIMER2":{table:"md_material_finish",column:"primer2"},"MD:PRIMER3":{table:"md_material_finish",column:"primer3"},"MD:TOPCOAT1":{table:"md_material_finish",column:"topcoat1"},"MD:TOPCOAT2":{table:"md_material_finish",column:"topcoat2"},"MD:ANTIABRASION":{table:"md_material_finish",column:"antiabration"},"MD:PRIMER1_NAME":{table:"md_material_finish",column:"primer1_name"},"MD:TOPCOAT_NAME":{table:"md_material_finish",column:"topcoat_name"},"MD:ANTIABRASION_NAME":{table:"md_material_finish",column:"antiabrasion_name"},"MD:VARINISH_NAME":{table:"md_material_finish",column:"varinish_name"},"MD:PROGRAM":{table:"md_part",column:"program"},"MD:PART_CLUSTER":{table:"md_part",column:"part_cluster"},"MD:PART_DESCRIPTION":{table:"md_part",column:"part_description"},"MD:SURFACE_DM2":{table:"md_part",column:"surface_dm2"}
};

// v278: chỉ lấy giá trị unique của CỘT đang chọn. Không preload dữ liệu lớn khi mở Công thức & Rule.
export async function GET(req:NextRequest){
 const url=new URL(req.url);
 const column=clean(url.searchParams.get("column"));
 const search=clean(url.searchParams.get("q"));
 if(!column)return NextResponse.json({error:"Thiếu column."},{status:400});
 const c=await getPool().connect();
 try{
  const params:any[]=[]; let sql="";
  if(column.startsWith("MD:REQ:")){
   const code=column.slice(7).trim().toUpperCase(); if(!code)return NextResponse.json({error:"Mã yêu cầu không hợp lệ."},{status:400});
   params.push(code); let where="is_active=true and upper(trim(requirement_code))=$1 and nullif(trim(requirement_value),'') is not null";
   if(search){params.push(`%${search}%`);where+=` and requirement_value ilike $${params.length}`;}
   sql=`select distinct requirement_value::text value from md_process_requirement where ${where} order by value limit 500`;
  }else if(MASTER_COLUMNS[column]){
   const spec=MASTER_COLUMNS[column]; let where=`is_active=true and nullif(trim(${spec.column}::text),'') is not null`;
   if(search){params.push(`%${search}%`);where+=` and ${spec.column}::text ilike $${params.length}`;}
   sql=`select distinct ${spec.column}::text value from ${spec.table} where ${where} order by value limit 500`;
  }else{
   params.push(column); let where="is_active=true and source_column=$1 and nullif(trim(source_value),'') is not null";
   if(search){params.push(`%${search}%`);where+=` and source_value ilike $${params.length}`;}
   sql=`select distinct source_value value from md_open_job_column_value where ${where} order by value limit 500`;
  }
  const q=await c.query(sql,params);
  return NextResponse.json({values:q.rows.map((r:any)=>String(r.value)),limited:q.rowCount===500});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}
 finally{c.release()}
}
