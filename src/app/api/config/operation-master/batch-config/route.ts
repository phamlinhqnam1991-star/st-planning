import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {validBatchPrefix} from "@/lib/planning/batch-number";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();

export async function GET(req:Request){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
 const url=new URL(req.url);
 const operation=clean(url.searchParams.get("standard_operation")).toUpperCase();
 if(!operation)return NextResponse.json({error:"Thiếu Main Operation."},{status:400});
 const c=await getPool().connect();
 try{
  const [opQ,rulesQ,recipesQ]=await Promise.all([
   c.query(`
    select standard_operation,batch_prefix,batch_sequence_start,batch_sequence_padding,batch_size_qty,batch_auto_split
    from md_operation_master
    where upper(trim(standard_operation))=$1 and is_active=true
    limit 1
   `,[operation]),
   c.query(`
    select r.id,r.recipe_key,r.batch_size_qty,r.note,
           pr.recipe_no,pr.recipe_name
    from md_operation_recipe_batch_size r
    left join md_process_recipe pr on pr.recipe_key=r.recipe_key
    where upper(trim(r.standard_operation))=$1 and r.is_active=true
    order by coalesce(pr.recipe_no,''),coalesce(pr.recipe_name,''),r.id
   `,[operation]),
   c.query(`
    select distinct pr.recipe_key,pr.recipe_no,pr.recipe_name
    from md_main_operation_recipe m
    join md_process_recipe pr on pr.recipe_key=m.recipe_key and pr.is_active=true
    where m.is_active=true
      and upper(trim(coalesce(nullif(trim(m.standard_operation),''),nullif(trim(m.operation_code),''))))=$1
    order by pr.recipe_no nulls last,pr.recipe_name,pr.recipe_key
   `,[operation])
  ]);
  if(!opQ.rowCount)return NextResponse.json({error:"Không tìm thấy Main Operation đang hoạt động."},{status:404});
  return NextResponse.json({ok:true,row:opQ.rows[0],recipeRules:rulesQ.rows,recipes:recipesQ.rows});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}
 finally{c.release();}
}

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const operation=clean(body.standard_operation).toUpperCase();
 const prefix=validBatchPrefix(body.batch_prefix);
 const start=Number(body.batch_sequence_start);
 const padding=Number(body.batch_sequence_padding);
 const size=body.batch_size_qty==null||body.batch_size_qty===""?null:Number(body.batch_size_qty);
 const autoSplit=body.batch_auto_split===true;
 const recipeRules=Array.isArray(body.recipe_size_rules)?body.recipe_size_rules:[];
 if(!operation)return NextResponse.json({error:"Thiếu Main Operation."},{status:400});
 if(!prefix)return NextResponse.json({error:"Batch Prefix: 1-30 ký tự A-Z, 0-9, _ hoặc -."},{status:400});
 if(!Number.isInteger(start)||start<0)return NextResponse.json({error:"Sequence Start phải là số nguyên >= 0."},{status:400});
 if(!Number.isInteger(padding)||padding<1||padding>12)return NextResponse.json({error:"Sequence Padding phải từ 1 đến 12."},{status:400});
 if(size!==null&&(!Number.isFinite(size)||size<=0))return NextResponse.json({error:"Batch Size dùng chung phải > 0 hoặc để trống."},{status:400});

 const normalizedRules:{recipe_key:string;batch_size_qty:number}[]=[];
 const seen=new Set<string>();
 for(const raw of recipeRules){
  const recipeKey=clean(raw?.recipe_key);
  const rawSize=raw?.batch_size_qty==null||raw?.batch_size_qty===""?null:Number(raw.batch_size_qty);
  // Blank Recipe + blank Size is the COMMON/fallback state and is stored on Operation Master, not as an override row.
  if(!recipeKey&&rawSize===null)continue;
  if(!recipeKey)return NextResponse.json({error:"Recipe Batch Size: chọn Recipe hoặc xóa dòng override."},{status:400});
  if(rawSize===null||!Number.isFinite(rawSize)||rawSize<=0)
   return NextResponse.json({error:"Recipe Batch Size phải > 0. Để trống nếu muốn Recipe này dùng Batch Size chung."},{status:400});
  if(seen.has(recipeKey))return NextResponse.json({error:"Mỗi Recipe chỉ được cấu hình một Batch Size."},{status:400});
  seen.add(recipeKey);normalizedRules.push({recipe_key:recipeKey,batch_size_qty:rawSize});
 }

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const q=await c.query(`
   update md_operation_master
      set batch_prefix=$2,batch_sequence_start=$3,batch_sequence_padding=$4,
          batch_size_qty=$5,batch_auto_split=$6,updated_at=now()
    where upper(trim(standard_operation))=$1 and is_active=true
    returning standard_operation,batch_prefix,batch_sequence_start,batch_sequence_padding,batch_size_qty,batch_auto_split
  `,[operation,prefix,start,padding,size,autoSplit]);
  if(!q.rowCount)throw new Error("Không tìm thấy Main Operation đang hoạt động.");

  if(normalizedRules.length){
   const validQ=await c.query(`
    select distinct m.recipe_key
    from md_main_operation_recipe m
    join md_process_recipe pr on pr.recipe_key=m.recipe_key and pr.is_active=true
    where m.is_active=true
      and upper(trim(coalesce(nullif(trim(m.standard_operation),''),nullif(trim(m.operation_code),''))))=$1
      and m.recipe_key=any($2::text[])
   `,[operation,normalizedRules.map(x=>x.recipe_key)]);
   const valid=new Set(validQ.rows.map((r:any)=>String(r.recipe_key)));
   const invalid=normalizedRules.find(x=>!valid.has(x.recipe_key));
   if(invalid)throw new Error(`Recipe ${invalid.recipe_key} không thuộc Main Operation ${operation}.`);
  }

  await c.query(`update md_operation_recipe_batch_size set is_active=false,updated_at=now() where upper(trim(standard_operation))=$1 and is_active=true`,[operation]);
  for(const rule of normalizedRules){
   await c.query(`
    insert into md_operation_recipe_batch_size(standard_operation,recipe_key,batch_size_qty,is_active,updated_at)
    values($1,$2,$3,true,now())
   `,[q.rows[0].standard_operation,rule.recipe_key,rule.batch_size_qty]);
  }
  await c.query("commit");
  invalidateConfigHealth();invalidatePlanningStaticData();
  return NextResponse.json({ok:true,row:q.rows[0],recipeRules:normalizedRules});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release();}
}
