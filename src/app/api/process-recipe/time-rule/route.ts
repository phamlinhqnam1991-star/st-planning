import {NextRequest,NextResponse} from "next/server";
import type {PoolClient} from "pg";
import {getPool} from "@/lib/db";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {refreshUnscheduledRecipeBatches} from "@/lib/planning/batch-utils";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();
const nullableNumber=(v:unknown)=>{
 const x=clean(v);
 if(!x)return null;
 const n=Number(x);
 return Number.isFinite(n)?n:null;
};
const intOr=(v:unknown,def=100)=>{
 const n=Number(v);
 return Number.isFinite(n)?Math.trunc(n):def;
};

// Backward compatible: accepts old decimal hours (7.5) and new HH:MM (07:30).
const durationHours=(v:unknown)=>{
 const x=clean(v);
 if(!x)return null;
 const m=x.match(/^(\d{1,3}):([0-5]\d)$/);
 if(m){
  const h=Number(m[1]);
  const min=Number(m[2]);
  return h+min/60;
 }
 const n=Number(x);
 return Number.isFinite(n)?n:null;
};

type ConditionInput={source_column:string;source_value:string};

function parseConditions(v:unknown):ConditionInput[]{
 if(v==null)return [];
 if(!Array.isArray(v))throw new Error("Điều kiện Open Job phải là danh sách.");
 if(v.length>8)throw new Error("Mỗi Time Rule được tối đa 8 cột điều kiện.");
 const rows=v.map((x:any)=>({
  source_column:clean(x?.source_column),
  source_value:clean(x?.source_value)
 }));
 if(rows.some(x=>!x.source_column||!x.source_value))
  throw new Error("Mỗi điều kiện phải chọn đủ Cột Open Job và Giá trị.");
 const seen=new Set<string>();
 for(const row of rows){
  const key=row.source_column.toUpperCase();
  if(seen.has(key))throw new Error(`Cột ${row.source_column} đang được chọn lặp trong cùng một rule.`);
  seen.add(key);
 }
 return rows;
}

async function validateConditions(c:PoolClient,rows:ConditionInput[]){
 if(!rows.length)return;
 const columns=rows.map(x=>x.source_column);
 const values=rows.map(x=>x.source_value);
 const q=await c.query(`
   select v.source_column,v.source_value
   from md_open_job_column_value v
   join unnest($1::text[],$2::text[]) x(source_column,source_value)
     on x.source_column=v.source_column
    and x.source_value=v.source_value
   where v.is_active=true
 `,[columns,values]);
 const found=new Set(q.rows.map((r:any)=>`${String(r.source_column)}\u0001${String(r.source_value)}`));
 const missing=rows.filter(x=>!found.has(`${x.source_column}\u0001${x.source_value}`));
 if(missing.length){
  throw new Error(
   "Giá trị điều kiện không còn tồn tại trong Open Job Column Values: "+
   missing.map(x=>`${x.source_column} = ${x.source_value}`).join("; ")
  );
 }
}

async function replaceConditions(c:PoolClient,ruleId:number,rows:ConditionInput[]){
 await c.query(`delete from md_recipe_time_rule_condition where rule_id=$1`,[ruleId]);
 if(!rows.length)return;
 await c.query(`
   insert into md_recipe_time_rule_condition(
     rule_id,condition_order,source_column,source_value,is_active
   )
   select $1,x.ord::int,x.source_column,x.source_value,true
   from unnest($2::text[],$3::text[]) with ordinality
        as x(source_column,source_value,ord)
 `,[ruleId,rows.map(x=>x.source_column),rows.map(x=>x.source_value)]);
}

function validateRange(min:number|null,max:number|null,label:string){
 if(min!==null&&min<0)throw new Error(`${label} Min không được âm.`);
 if(max!==null&&max<0)throw new Error(`${label} Max không được âm.`);
 if(min!==null&&max!==null&&min>max)throw new Error(`${label} Min không được lớn hơn Max.`);
}

function validateRule(calcType:string,fixedHours:number|null,standardHours:number|null){
 if(!["FIXED_HOURS","QTY_SURFACE"].includes(calcType))
  throw new Error("Calc Type không hợp lệ.");
 if(calcType==="FIXED_HOURS" && (fixedHours===null||fixedHours<=0))
  throw new Error("Thời gian cố định phải lớn hơn 00:00.");
 if(calcType==="QTY_SURFACE" && (standardHours===null||standardHours<=0))
  throw new Error("Thời gian chuẩn phải lớn hơn 00:00.");
}

export async function POST(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const recipeKey=clean(b.recipe_key);
 const calcType=clean(b.calc_type).toUpperCase();
 const priority=Math.max(1,intOr(b.priority,100));
 const qtyMin=nullableNumber(b.qty_min);
 const qtyMax=nullableNumber(b.qty_max);
 const surfaceMin=nullableNumber(b.surface_min_dm2);
 const surfaceMax=nullableNumber(b.surface_max_dm2);
 const fixedHours=durationHours(b.fixed_hours);
 const standardHours=durationHours(b.standard_hours);
 const note=clean(b.note)||null;
 let conditions:ConditionInput[]=[];

 if(!recipeKey)
  return NextResponse.json({error:"Recipe là bắt buộc."},{status:400});

 try{
  conditions=parseConditions(b.conditions);
  validateRule(calcType,fixedHours,standardHours);
  validateRange(qtyMin,qtyMax,"Qty");
  validateRange(surfaceMin,surfaceMax,"Surface");
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const recipe=await c.query(`
    select recipe_key
    from md_process_recipe
    where recipe_key=$1 and is_active=true
    for update
  `,[recipeKey]);
  if(!recipe.rowCount)throw new Error("Recipe không tồn tại hoặc đã inactive.");

  await validateConditions(c,conditions);

  // Một Recipe chỉ có MỘT Calculation Mode active, nhưng trong mode đó được
  // có NHIỀU rule (vd FIXED theo Program/Category khác nhau + 1 fallback).
  await c.query(`
    update md_recipe_time_rule
    set is_active=false,updated_at=now()
    where recipe_key=$1
      and is_active=true
      and calc_type<>$2
  `,[recipeKey,calcType]);

  const inserted=await c.query(`
    insert into md_recipe_time_rule(
      recipe_key,calc_type,priority,
      qty_min,qty_max,
      surface_min_dm2,surface_max_dm2,
      fixed_hours,standard_hours,
      note,is_active
    )
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
    returning id
  `,[
    recipeKey,calcType,priority,
    qtyMin,qtyMax,surfaceMin,surfaceMax,
    calcType==="FIXED_HOURS"?fixedHours:null,
    calcType==="QTY_SURFACE"?standardHours:null,
    note
  ]);
  const ruleId=Number(inserted.rows[0].id);
  await replaceConditions(c,ruleId,conditions);

  const updatedBatches=await refreshUnscheduledRecipeBatches(c,recipeKey);
  await c.query("commit");
  invalidateConfigHealth();
  return NextResponse.json({ok:true,id:ruleId,updated_batches:updatedBatches});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release()}
}

export async function PATCH(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const id=Number(b.id);
 if(!Number.isFinite(id))
  return NextResponse.json({error:"Time Rule ID không hợp lệ."},{status:400});

 const calcType=clean(b.calc_type).toUpperCase();
 const priority=Math.max(1,intOr(b.priority,100));
 const qtyMin=nullableNumber(b.qty_min);
 const qtyMax=nullableNumber(b.qty_max);
 const surfaceMin=nullableNumber(b.surface_min_dm2);
 const surfaceMax=nullableNumber(b.surface_max_dm2);
 const fixedHours=durationHours(b.fixed_hours);
 const standardHours=durationHours(b.standard_hours);
 const note=clean(b.note)||null;
 let conditions:ConditionInput[]=[];

 try{
  conditions=parseConditions(b.conditions);
  validateRule(calcType,fixedHours,standardHours);
  validateRange(qtyMin,qtyMax,"Qty");
  validateRange(surfaceMin,surfaceMax,"Surface");
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const current=await c.query(`
    select recipe_key
    from md_recipe_time_rule
    where id=$1
    for update
  `,[id]);
  if(!current.rowCount)throw new Error("Không tìm thấy Time Rule.");
  const recipeKey=String(current.rows[0].recipe_key);

  await validateConditions(c,conditions);

  await c.query(`
    update md_recipe_time_rule
    set is_active=false,updated_at=now()
    where recipe_key=$1
      and id<>$2
      and is_active=true
      and calc_type<>$3
  `,[recipeKey,id,calcType]);

  await c.query(`
    update md_recipe_time_rule
    set calc_type=$2,
        priority=$3,
        qty_min=$4,
        qty_max=$5,
        surface_min_dm2=$6,
        surface_max_dm2=$7,
        fixed_hours=$8,
        standard_hours=$9,
        note=$10,
        is_active=true,
        updated_at=now()
    where id=$1
  `,[
    id,calcType,priority,
    qtyMin,qtyMax,surfaceMin,surfaceMax,
    calcType==="FIXED_HOURS"?fixedHours:null,
    calcType==="QTY_SURFACE"?standardHours:null,
    note
  ]);
  await replaceConditions(c,id,conditions);

  const updatedBatches=await refreshUnscheduledRecipeBatches(c,recipeKey);
  await c.query("commit");
  invalidateConfigHealth();
  return NextResponse.json({ok:true,updated_batches:updatedBatches});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release()}
}

export async function DELETE(req:NextRequest){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const id=Number(b.id);
 if(!Number.isFinite(id))
  return NextResponse.json({error:"Time Rule ID không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");
  const q=await c.query(`
    update md_recipe_time_rule
    set is_active=false,updated_at=now()
    where id=$1
    returning recipe_key
  `,[id]);
  if(!q.rowCount)throw new Error("Không tìm thấy Time Rule.");
  const recipeKey=String(q.rows[0].recipe_key);
  const updatedBatches=await refreshUnscheduledRecipeBatches(c,recipeKey);
  await c.query("commit");
  invalidateConfigHealth();
  return NextResponse.json({ok:true,updated_batches:updatedBatches});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }finally{c.release()}
}
