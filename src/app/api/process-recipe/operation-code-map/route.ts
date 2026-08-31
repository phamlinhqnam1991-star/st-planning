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

/** Runtime mapping used by live-recipe.ts and sync-planning-chains.ts:
 * md_main_operation_recipe (Operation Code → Recipe).
 * The endpoint accepts multiple recipes per source operation; conditions
 * determine eligibility, then priority → default → updated time determines
 * the exact recipe proposed by Planning Board.
 */
export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
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

   // Mapping must belong to an active Planning Operation in the canonical ST flow.
   // This prevents a random/raw/inactive operation code from appearing as a
   // seemingly-valid recipe configuration that can never generate a board row.
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
    if(!opQ.rowCount)
     throw new Error(`Main Operation ${standardOperation} chưa có trong Operation Master.`);
   }

   // The partial unique index allows one active default per source operation.
   if(isDefault){
    await c.query(`
      update md_main_operation_recipe
      set is_default=false,updated_at=now()
      where upper(trim(operation_code))=$1
        and is_active=true
        and is_default=true
    `,[operationCode]);
   }

   await c.query(`
     insert into md_main_operation_recipe(
       operation_code,standard_operation,recipe_key,priority,selection_rule,is_default,note,is_active,
       batch_key_template,batch_no_prefix
     ) values($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
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
   invalidateConfigHealth();
   return NextResponse.json({
    ok:true,
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
  const operationCode=upper(b.operation_code);
  const recipeKey=clean(b.recipe_key);
  if(!operationCode||!recipeKey)
   return NextResponse.json({error:"Operation Code và Recipe là bắt buộc."},{status:400});

  const c=await getPool().connect();
  try{
   const q=await c.query(`
     update md_main_operation_recipe
     set is_active=false,is_default=false,updated_at=now()
     where upper(trim(operation_code))=$1 and recipe_key=$2 and is_active=true
     returning operation_code,recipe_key
   `,[operationCode,recipeKey]);
   if(!q.rowCount)return NextResponse.json({error:"Không tìm thấy mapping đang hoạt động."},{status:404});
  }finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }
}
