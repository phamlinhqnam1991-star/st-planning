import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {canonicalizeSelectionRule} from "@/lib/batch-key-recipe";
import {requireApiUser} from "@/lib/api-auth";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase();
const toInt=(v:unknown,def=100)=>{
 const n=Number(v);
 return Number.isFinite(n)?Math.trunc(n):def;
};
const validPrefix=(v:unknown)=>/^[A-Z0-9]{3}$/.test(upper(v));

/**
 * v352: every row in md_main_operation_recipe is an independent Recipe Rule.
 * The same Operation Code + Recipe may therefore have MANY rows with different
 * selection_rule values. mapping_id is the durable identity used for edit/delete
 * and later stored on planning_batch as recipe_mapping_id.
 */
export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
  const mappingId=Number(b.mapping_id||0);
  const operationCode=upper(b.operation_code);
  const requestedStandardOperation=upper(b.standard_operation)||null;
  const recipeKey=clean(b.recipe_key);
  const note=clean(b.note)||null;
  const priority=Math.max(1,toInt(b.priority,100));
  const selectionRule=canonicalizeSelectionRule(b.selection_rule);
  const batchKeyTemplate=clean(b.batch_key_template)||null;
  const batchNoPrefix=upper(b.batch_no_prefix)||null;
  const isDefault=Boolean(b.is_default);

  if(!operationCode||!recipeKey)
   return NextResponse.json({error:"Operation Code và Recipe là bắt buộc."},{status:400});
  if(batchNoPrefix&&!validPrefix(batchNoPrefix))
   return NextResponse.json({error:"Prefix số lô phải đúng 3 ký tự chữ/số, ví dụ CHM hoặc PRI."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query("begin");

   const recipe=await c.query(`
     select recipe_key,process_family,recipe_group,recipe_no,recipe_name
     from md_process_recipe
     where recipe_key=$1 and is_active=true
     for update
   `,[recipeKey]);
   if(!recipe.rowCount)throw new Error("Recipe không hợp lệ hoặc đã ngưng sử dụng.");

   const sourceQ=await c.query(`
     select m.source_operation_code,m.standard_operation_rule
     from md_st_operation_mapping m
     join md_st_operation_scope s
       on upper(trim(s.operation_code))=upper(trim(m.source_operation_code))
      and s.is_active=true
      and coalesce(s.operation_type,'PLANNING_OPERATION')='PLANNING_OPERATION'
     where upper(trim(m.source_operation_code))=$1
       and m.is_active=true
     order by m.sort_order,m.id
   `,[operationCode]);
   if(!sourceQ.rowCount)
    throw new Error(`Operation Code ${operationCode} chưa nằm trong ST Scope loại Planning Operation hoặc chưa có Source → Main Mapping. Hãy cấu hình luồng công đoạn trước tại Cấu hình → Trợ lý Operation / Source → Main Mapping.`);

   const mappedMain=[...new Set(sourceQ.rows.map((r:any)=>upper(r.standard_operation_rule)).filter(Boolean))];
   if(requestedStandardOperation&&!mappedMain.includes(requestedStandardOperation))
    throw new Error(`Main Operation ${requestedStandardOperation} không khớp với Source → Main Mapping của ${operationCode} (${mappedMain.join(", ")}).`);
   const standardOperation=requestedStandardOperation||mappedMain[0]||null;

   if(standardOperation){
    const opQ=await c.query(`
      select standard_operation from md_operation_master
      where upper(trim(standard_operation))=$1 and is_active=true limit 1
    `,[standardOperation]);
    if(!opQ.rowCount)throw new Error(`Main Operation ${standardOperation} chưa có trong Operation Master.`);
   }

   if(mappingId>0){
    const existsQ=await c.query(`
      select mapping_id
      from md_main_operation_recipe
      where mapping_id=$1
      for update
    `,[mappingId]);
    if(!existsQ.rowCount)throw new Error("Recipe Rule cần sửa không còn tồn tại.");
   }

   // Only one ACTIVE default rule per source operation. Exclude the row being edited.
   if(isDefault){
    await c.query(`
      update md_main_operation_recipe
      set is_default=false,updated_at=now()
      where upper(trim(operation_code))=$1
        and is_active=true
        and is_default=true
        and ($2::bigint<=0 or mapping_id<>$2)
    `,[operationCode,mappingId]);
   }

   if(mappingId<=0){
    const duplicateQ=await c.query(`
      select mapping_id
      from md_main_operation_recipe
      where upper(trim(operation_code))=$1
        and recipe_key=$2
        and coalesce(selection_rule,'')=coalesce($3,'')
        and is_active=true
      order by mapping_id
      limit 1
    `,[operationCode,recipeKey,selectionRule]);
    if(duplicateQ.rowCount)
      throw new Error(`Rule #${duplicateQ.rows[0].mapping_id} đã có cùng Operation Code + Recipe + bộ điều kiện. Hãy bấm Sửa rule đó hoặc thay đổi điều kiện trước khi thêm.`);
   }

   let saved:any;
   if(mappingId>0){
    const q=await c.query(`
      update md_main_operation_recipe
      set operation_code=$2,
          standard_operation=$3,
          recipe_key=$4,
          priority=$5,
          selection_rule=$6,
          is_default=$7,
          note=$8,
          batch_key_template=$9,
          batch_no_prefix=$10,
          is_active=true,
          updated_at=now()
      where mapping_id=$1
      returning mapping_id,operation_code,standard_operation,recipe_key
    `,[mappingId,operationCode,standardOperation,recipeKey,priority,selectionRule,isDefault,note,batchKeyTemplate,batchNoPrefix]);
    saved=q.rows[0];
   }else{
    const q=await c.query(`
      insert into md_main_operation_recipe(
        operation_code,standard_operation,recipe_key,priority,selection_rule,is_default,note,is_active,
        batch_key_template,batch_no_prefix
      ) values($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
      returning mapping_id,operation_code,standard_operation,recipe_key
    `,[operationCode,standardOperation,recipeKey,priority,selectionRule,isDefault,note,batchKeyTemplate,batchNoPrefix]);
    saved=q.rows[0];
   }

   await c.query("commit");
   invalidateConfigHealth();
   return NextResponse.json({
    ok:true,
    mapping_id:Number(saved.mapping_id),
    mode:mappingId>0?"UPDATED":"CREATED",
    operation_code:operationCode,
    standard_operation:standardOperation,
    recipe:{
     recipe_key:recipe.rows[0].recipe_key,
     recipe_no:recipe.rows[0].recipe_no,
     recipe_name:recipe.rows[0].recipe_name
    }
   });
  }catch(error){
   await c.query("rollback");
   throw error;
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }
}

export async function DELETE(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
  const mappingId=Number(b.mapping_id||0);
  const operationCode=upper(b.operation_code);
  const recipeKey=clean(b.recipe_key);

  const c=await getPool().connect();
  try{
   let q;
   if(mappingId>0){
    q=await c.query(`
      update md_main_operation_recipe
      set is_active=false,is_default=false,updated_at=now()
      where mapping_id=$1 and is_active=true
      returning mapping_id,operation_code,recipe_key
    `,[mappingId]);
   }else{
    // Legacy callers are accepted only when the pair identifies exactly one active rule.
    if(!operationCode||!recipeKey)
     return NextResponse.json({error:"mapping_id là bắt buộc để xóa đúng Recipe Rule."},{status:400});
    const countQ=await c.query(`
      select mapping_id
      from md_main_operation_recipe
      where upper(trim(operation_code))=$1 and recipe_key=$2 and is_active=true
      order by mapping_id
    `,[operationCode,recipeKey]);
    if(countQ.rowCount!==1)
     return NextResponse.json({error:"Có nhiều Rule dùng cùng Operation Code + Recipe. Hãy tải lại trang và xóa theo đúng Rule."},{status:409});
    q=await c.query(`
      update md_main_operation_recipe
      set is_active=false,is_default=false,updated_at=now()
      where mapping_id=$1 and is_active=true
      returning mapping_id,operation_code,recipe_key
    `,[countQ.rows[0].mapping_id]);
   }
   if(!q.rowCount)return NextResponse.json({error:"Không tìm thấy Recipe Rule đang hoạt động."},{status:404});
  }finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }
}
