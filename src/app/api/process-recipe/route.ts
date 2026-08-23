import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

const clean=(v:unknown)=>String(v??"").trim();
const normalizeRecipeNo=(v:unknown)=>{
 const x=clean(v);
 return /^\d+$/.test(x)?x.padStart(3,"0"):x;
};
const makeKey=(family:string,group:string,no:string)=>
 `${family}|${group}|${no.toUpperCase()}`;

const makeBatchKey=(family:string,group:string,name:string)=>
 `${family}|${group}|${(name||"UNMAPPED").toUpperCase()}`;

export async function POST(req:NextRequest){
 try{
  const b=await req.json();
  const family=clean(b.process_family).toUpperCase();
  const group=clean(b.recipe_group).toUpperCase();
  const no=normalizeRecipeNo(b.recipe_no);
  const name=clean(b.recipe_name);
  const batch=clean(b.batch_key);

  if(!family||!group||!no)
   return NextResponse.json({error:"Process Family, Recipe Group và Recipe No là bắt buộc."},{status:400});

  const c=await getPool().connect();
  try{
   const current=await c.query(`
     select recipe_key
     from md_process_recipe
     where process_family=$1 and recipe_group=$2 and recipe_no=$3 and is_active=true
     order by case when source_system='MANUAL' then 0 else 1 end, updated_at desc
     limit 1
   `,[family,group,no]);

   if(current.rowCount){
    const key=current.rows[0].recipe_key;
    await c.query(`
      update md_process_recipe
      set recipe_name=$2,
          batch_key=$3,
          source_system='MANUAL',
          note=$4,
          is_active=true,
          updated_at=now()
      where recipe_key=$1
    `,[key,name||null,batch||makeBatchKey(family,group,name),clean(b.note)||null]);

    return NextResponse.json({ok:true,recipe_key:key,updated:true});
   }

   const key=makeKey(family,group,no);
   await c.query(`
     insert into md_process_recipe(
       recipe_key,process_family,recipe_group,recipe_no,recipe_name,
       batch_key,source_system,note,is_active
     )
     values($1,$2,$3,$4,$5,$6,'MANUAL',$7,true)
   `,[key,family,group,no,name||null,batch||makeBatchKey(family,group,name),clean(b.note)||null]);

   return NextResponse.json({ok:true,recipe_key:key,created:true});
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})
 }
}

export async function PATCH(req:NextRequest){
 try{
  const b=await req.json(),key=clean(b.recipe_key);
  if(!key)return NextResponse.json({error:"recipe_key không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   const current=await c.query(`
     select process_family,recipe_group
     from md_process_recipe
     where recipe_key=$1
   `,[key]);
   if(!current.rowCount)
    return NextResponse.json({error:"Không tìm thấy Recipe."},{status:404});

   const family=current.rows[0].process_family;
   const group=current.rows[0].recipe_group;
   const no=normalizeRecipeNo(b.recipe_no);
   const name=clean(b.recipe_name);
   const batch=clean(b.batch_key)||makeBatchKey(family,group,name);

   await c.query(`
     update md_process_recipe
     set recipe_no=$2,
         recipe_name=$3,
         batch_key=$4,
         source_system='MANUAL',
         note=$5,
         is_active=true,
         updated_at=now()
     where recipe_key=$1
   `,[key,no||null,name||null,batch,clean(b.note)||null]);
  }finally{c.release()}

  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})
 }
}

export async function DELETE(req:NextRequest){
 try{
  const b=await req.json(),key=clean(b.recipe_key);
  const c=await getPool().connect();
  try{
   const used=await c.query("select count(*)::int n from md_part_process_recipe where recipe_key=$1 and is_active",[key]);
   if(Number(used.rows[0]?.n||0)>0)
    return NextResponse.json({error:`Recipe đang được ${used.rows[0].n} Part/Revision sử dụng. Không thể deactivate.`},{status:409});
   await c.query("update md_process_recipe set is_active=false,updated_at=now() where recipe_key=$1",[key]);
   await c.query("update md_operation_recipe_mapping set is_active=false,updated_at=now() where recipe_key=$1",[key]);
  }finally{c.release()}
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
}
