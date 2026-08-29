import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const toInt=(v:unknown,def=100)=>{
 const n=Number(v);
 return Number.isFinite(n)?Math.trunc(n):def;
};

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const operationCode=clean(b.operation_code);
  const standardOperation=clean(b.standard_operation)||null;
  const recipeKey=clean(b.recipe_key);
  const note=clean(b.note)||null;
  const priority=Math.max(1,toInt(b.priority,100));
  const selectionRule=clean(b.selection_rule)||null;
  const batchKeyTemplate=clean(b.batch_key_template)||null;
  const batchNoPrefix=clean(b.batch_no_prefix)||null;
  const isDefault=Boolean(b.is_default);

  if(!operationCode||!recipeKey)
   return NextResponse.json({error:"Operation Code và Recipe là bắt buộc."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query("begin");

   const recipe=await c.query(`
     select recipe_key
     from md_process_recipe
     where recipe_key=$1
       and is_active=true
   `,[recipeKey]);

   if(!recipe.rowCount){
    await c.query("rollback");
    return NextResponse.json({error:"Recipe không hợp lệ."},{status:400});
   }

   if(standardOperation){
    const opQ=await c.query(`
      select standard_operation from md_operation_master
      where standard_operation=$1 and is_active=true limit 1
    `,[standardOperation]);
    if(!opQ.rowCount){
     await c.query("rollback");
     return NextResponse.json({error:`Main Operation ${standardOperation} chưa có trong Operation Master.`},{status:400});
    }
   }

   // Keep only one default Recipe per Operation Code.
   // v277: unique index uq_operation_code_recipe_active_default áp cho CẢ
   // operation_code (không tách theo standard_operation) → phải gỡ mặc định
   // của MỌI dòng cùng operation_code, nếu không INSERT/UPDATE văng lỗi 500
   // (duplicate key) khi tick "Recipe mặc định" mà đã có dòng mặc định khác.
   if(isDefault){
    await c.query(`
      update md_main_operation_recipe
      set is_default=false,updated_at=now()
      where operation_code=$1
        and is_active=true
        and is_default=true
    `,[operationCode]);
   }

   await c.query(`
     insert into md_main_operation_recipe(
       operation_code,standard_operation,recipe_key,priority,selection_rule,is_default,note,is_active,
       batch_key_template,batch_no_prefix
     )
     values($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
     on conflict(operation_code,recipe_key)
     do update set
       standard_operation=excluded.standard_operation,
       priority=excluded.priority,
       selection_rule=excluded.selection_rule,
       is_default=excluded.is_default,
       note=excluded.note,
       batch_key_template=excluded.batch_key_template,
       batch_no_prefix=excluded.batch_no_prefix,
       is_active=true,
       updated_at=now()
   `,[operationCode,standardOperation,recipeKey,priority,selectionRule,isDefault,note,batchKeyTemplate,batchNoPrefix]);

   await c.query("commit");
  }catch(e){
   await c.query("rollback");
   throw e;
  }finally{
   c.release();
  }

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})
 }
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json();
  const operationCode=clean(b.operation_code);
  const recipeKey=clean(b.recipe_key);

  if(!operationCode||!recipeKey)
   return NextResponse.json({error:"Operation Code và Recipe là bắt buộc."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query(`
     update md_main_operation_recipe
     set is_active=false,is_default=false,updated_at=now()
     where operation_code=$1
       and recipe_key=$2
   `,[operationCode,recipeKey]);
  }finally{c.release()}

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})
 }
}
