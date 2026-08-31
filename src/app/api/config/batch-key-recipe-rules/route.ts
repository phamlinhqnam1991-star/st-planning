import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const toInt=(v:unknown,def:number)=>{
 const n=Number(v);
 return Number.isFinite(n)?Math.trunc(n):def;
};

// =====================================================================
// Batch Key / Recipe Rules
// Rule xác định Recipe + Batch Key + Batch No Prefix cho từng Main Operation.
// GET  : danh sách rule + conditions (+ lọc standard_operation)
// POST : tạo / cập nhật rule (kèm conditions, thay thế toàn bộ)
// DELETE: inactivate rule
// =====================================================================

export async function GET(req:NextRequest){
 try{
  const url=new URL(req.url);
  const standardOperation=clean(url.searchParams.get("standard_operation"));
  const q=clean(url.searchParams.get("q"));

  const params:any[]=[];
  const conds:any[]=[];
  if(standardOperation){params.push(standardOperation);conds.push(`r.standard_operation=$${params.length}`);}
  if(q){params.push(`%${q}%`);conds.push(`(r.rule_name ilike $${params.length} or r.standard_operation ilike $${params.length})`);}
  const where=conds.length?`where ${conds.join(" and ")}`:"where r.is_active=true";

  const c=await getPool().connect();
  try{
   const q1=await c.query(`
     select
       r.id,r.rule_name,r.standard_operation,r.match_mode,r.priority,
       r.suggested_recipe_key,r.batch_key_template,r.batch_no_prefix,r.is_active,r.note,
       pr.recipe_no suggested_recipe_no,
       pr.recipe_name suggested_recipe_name,
       coalesce(jsonb_agg(
         jsonb_build_object(
           'id',c.id,'source_column',c.source_column,'operator',c.operator,
           'source_value',c.source_value,'is_active',c.is_active
         ) order by c.id
       ) filter (where c.id is not null),'[]'::jsonb) conditions
     from md_batch_key_recipe_rule r
     left join md_batch_key_recipe_rule_condition c on c.rule_id=r.id
     left join md_process_recipe pr on pr.recipe_key=r.suggested_recipe_key and pr.is_active=true
     ${where}
     group by r.id,pr.recipe_no,pr.recipe_name
     order by r.standard_operation,r.priority,r.id
   `,params);

   const opsQ=await c.query(`
     select standard_operation
     from md_operation_master
     where is_active=true
     order by standard_operation
   `);

   const recipesQ=await c.query(`
     select recipe_key,process_family,recipe_group,recipe_no,recipe_name,batch_key
     from md_process_recipe
     where is_active=true
     order by process_family,recipe_group,recipe_no nulls last,recipe_name
     limit 3000
   `);

   const columnsQ=await c.query(`
     select source_column,count(*)::int value_count
     from md_open_job_column_value
     where is_active=true
     group by source_column
     order by source_column
   `);

   return NextResponse.json({
     rows:q1.rows,
     operations:opsQ.rows.map((r:any)=>r.standard_operation),
     recipes:recipesQ.rows,
     columns:columnsQ.rows
   });
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const id=b.id?Number(b.id):null;
  const ruleName=clean(b.rule_name);
  const standardOperation=clean(b.standard_operation);
  const matchMode=clean(b.match_mode).toUpperCase()==="ANY"?"ANY":"ALL";
  const priority=Math.max(1,toInt(b.priority,100));
  const suggestedRecipeKey=clean(b.suggested_recipe_key)||null;
  const batchKeyTemplate=clean(b.batch_key_template)||null;
  const batchNoPrefix=clean(b.batch_no_prefix).toUpperCase();
  const isActive=b.is_active===false?false:true;
  const note=clean(b.note)||null;
  const conditions=Array.isArray(b.conditions)?b.conditions:[];
  const validPrefix=/^[A-Z0-9]{0,3}$/.test(batchNoPrefix);

  if(!ruleName||!standardOperation)
   return NextResponse.json({error:"Rule Name và Main Operation là bắt buộc."},{status:400});

  if(!validPrefix)
   return NextResponse.json({error:"Batch No Prefix phải là 0-3 ký tự chữ/số (ví dụ CHM, PRI)."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query("begin");

   const opQ=await c.query(`
     select standard_operation from md_operation_master
     where standard_operation=$1 and is_active=true limit 1
   `,[standardOperation]);
   if(!opQ.rowCount)
    return NextResponse.json({error:`Main Operation ${standardOperation} chưa có trong Operation Master.`},{status:400});

   if(suggestedRecipeKey){
    const rq=await c.query(`
      select recipe_key from md_process_recipe
      where recipe_key=$1 and is_active=true limit 1
    `,[suggestedRecipeKey]);
    if(!rq.rowCount)
     return NextResponse.json({error:"Suggested Recipe không tồn tại hoặc đã inactive."},{status:400});
   }

   let ruleId=id;
   if(ruleId){
    const exist=await c.query(`select id from md_batch_key_recipe_rule where id=$1`,[ruleId]);
    if(!exist.rowCount)return NextResponse.json({error:"Không tìm thấy Rule."},{status:404});

    await c.query(`
      update md_batch_key_recipe_rule
      set rule_name=$2,standard_operation=$3,match_mode=$4,priority=$5,
          suggested_recipe_key=$6,batch_key_template=$7,batch_no_prefix=$8,
          is_active=$9,note=$10,updated_at=now()
      where id=$1
    `,[ruleId,ruleName,standardOperation,matchMode,priority,suggestedRecipeKey,batchKeyTemplate,batchNoPrefix||null,isActive,note]);
   }else{
    const ins=await c.query(`
      insert into md_batch_key_recipe_rule(
        rule_name,standard_operation,match_mode,priority,
        suggested_recipe_key,batch_key_template,batch_no_prefix,is_active,note
      )
      values($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning id
    `,[ruleName,standardOperation,matchMode,priority,suggestedRecipeKey,batchKeyTemplate,batchNoPrefix||null,isActive,note]);
    ruleId=ins.rows[0].id;
   }

   // Thay thế toàn bộ conditions (inactivate những cái còn lại).
   await c.query(`
     update md_batch_key_recipe_rule_condition
     set is_active=false,updated_at=now()
     where rule_id=$1
   `,[ruleId]);

   let n=0;
   for(const raw of conditions){
    const sourceColumn=clean(raw.source_column);
    const operator=clean(raw.operator);
    const sourceValue=clean(raw.source_value)||null;
    const condActive=raw.is_active===false?false:true;
    if(!sourceColumn)continue;
    if(!["equals","contains","not_empty","starts_with","ends_with"].includes(operator))continue;
    if(operator!=="not_empty"&&!sourceValue)continue;

    await c.query(`
      insert into md_batch_key_recipe_rule_condition(
        rule_id,source_column,operator,source_value,is_active
      )
      values($1,$2,$3,$4,$5)
    `,[ruleId,sourceColumn,operator,sourceValue,condActive]);
    n++;
   }

   if(n===0)
    return NextResponse.json({error:"Rule cần ít nhất 1 điều kiện hợp lệ."},{status:400});

   await c.query("commit");
   return NextResponse.json({ok:true,id:ruleId});
  }catch(e){
   await c.query("rollback");
   throw e;
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json();
  const id=Number(b.id);
  if(!Number.isFinite(id))
   return NextResponse.json({error:"ID không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query(`
     update md_batch_key_recipe_rule
     set is_active=false,updated_at=now()
     where id=$1
   `,[id]);
   return NextResponse.json({ok:true});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
