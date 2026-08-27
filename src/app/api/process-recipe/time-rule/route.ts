import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

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

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const recipeKey=clean(b.recipe_key);
  const calcType=clean(b.calc_type).toUpperCase();
  const priority=Math.max(1,intOr(b.priority,100));
  const qtyMin=nullableNumber(b.qty_min);
  const qtyMax=nullableNumber(b.qty_max);
  const surfaceMin=nullableNumber(b.surface_min_dm2);
  const surfaceMax=nullableNumber(b.surface_max_dm2);
  const fixedHours=nullableNumber(b.fixed_hours);
  const standardHours=nullableNumber(b.standard_hours);
  const note=clean(b.note)||null;

  if(!recipeKey)
   return NextResponse.json({error:"Recipe là bắt buộc."},{status:400});

  if(!["FIXED_HOURS","QTY_SURFACE"].includes(calcType))
   return NextResponse.json({error:"Calc Type không hợp lệ."},{status:400});

  if(calcType==="FIXED_HOURS" && fixedHours===null)
   return NextResponse.json({error:"Chemical Line / FIXED_HOURS phải nhập Fixed Hours."},{status:400});

  if(calcType==="QTY_SURFACE" && standardHours===null)
   return NextResponse.json({error:"Paint / QTY_SURFACE phải nhập Standard Hours."},{status:400});

  const c=await getPool().connect();
  try{
   const recipe=await c.query(`
     select process_family
     from md_process_recipe
     where recipe_key=$1 and is_active=true
   `,[recipeKey]);

   if(!recipe.rowCount)
    return NextResponse.json({error:"Recipe không tồn tại hoặc đã inactive."},{status:400});

   // Process Time áp dụng cho MỌI công đoạn chính: calc type do người dùng chọn,
   // không còn khóa cứng theo Chemical Line / Paint nữa.

   await c.query(`
     insert into md_recipe_time_rule(
       recipe_key,calc_type,priority,
       qty_min,qty_max,
       surface_min_dm2,surface_max_dm2,
       fixed_hours,standard_hours,
       note,is_active
     )
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
   `,[
     recipeKey,calcType,priority,
     qtyMin,qtyMax,surfaceMin,surfaceMax,
     calcType==="FIXED_HOURS"?fixedHours:null,
     calcType==="QTY_SURFACE"?standardHours:null,
     note
   ]);
  }finally{c.release()}

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function PATCH(req:NextRequest){
 try{
  const b=await req.json();
  const id=Number(b.id);
  if(!Number.isFinite(id))
   return NextResponse.json({error:"Time Rule ID không hợp lệ."},{status:400});

  const calcType=clean(b.calc_type).toUpperCase();
  const priority=Math.max(1,intOr(b.priority,100));
  const qtyMin=nullableNumber(b.qty_min);
  const qtyMax=nullableNumber(b.qty_max);
  const surfaceMin=nullableNumber(b.surface_min_dm2);
  const surfaceMax=nullableNumber(b.surface_max_dm2);
  const fixedHours=nullableNumber(b.fixed_hours);
  const standardHours=nullableNumber(b.standard_hours);
  const note=clean(b.note)||null;

  if(calcType==="FIXED_HOURS" && fixedHours===null)
   return NextResponse.json({error:"FIXED_HOURS phải nhập Fixed Hours."},{status:400});

  if(calcType==="QTY_SURFACE" && standardHours===null)
   return NextResponse.json({error:"QTY_SURFACE phải nhập Standard Hours."},{status:400});

  const c=await getPool().connect();
  try{
   const current=await c.query(`
     select r.process_family
     from md_recipe_time_rule t
     join md_process_recipe r on r.recipe_key=t.recipe_key
     where t.id=$1
   `,[id]);

   if(!current.rowCount)
    return NextResponse.json({error:"Không tìm thấy Time Rule."},{status:404});

   // Process Time áp dụng cho MỌI công đoạn chính; calc type do người dùng chọn.

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
  }finally{c.release()}

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json();
  const id=Number(b.id);
  if(!Number.isFinite(id))
   return NextResponse.json({error:"Time Rule ID không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query(`
     update md_recipe_time_rule
     set is_active=false,updated_at=now()
     where id=$1
   `,[id]);
  }finally{c.release()}

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
