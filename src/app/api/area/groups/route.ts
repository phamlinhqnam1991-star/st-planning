import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";

export async function PUT(req:NextRequest){
 const body=await req.json().catch(()=>({}));
 const areaId=Number(body.area_id);

 if(!areaId||!Array.isArray(body.groups))
  return NextResponse.json({error:"Dữ liệu không hợp lệ."},{status:400});

 const groups=[
  ...new Set(
   body.groups
    .map((x:unknown)=>String(x??"").trim().toUpperCase())
    .filter(Boolean)
  )
 ];

 const c=await getPool().connect();

 try{
  await c.query("begin");

  const currentQ=await c.query(`
   select st_group
   from md_area_operation_group
   where area_id=$1 and is_active=true
  `,[areaId]);

  const current=currentQ.rows.map(x=>String(x.st_group));
  const remove=current.filter(x=>!groups.includes(x));

  if(remove.length){
   await c.query(`
    delete from md_area_operation_group
    where area_id=$1
      and st_group=any($2::text[])
   `,[areaId,remove]);
  }

  for(const stGroup of groups){
   // One ST Group belongs to one Area: move it from another Area when selected here.
   await c.query(`
    delete from md_area_operation_group
    where st_group=$1
      and area_id<>$2
   `,[stGroup,areaId]);

   const existing=await c.query(`
    select id
    from md_area_operation_group
    where area_id=$1 and st_group=$2
    limit 1
   `,[areaId,stGroup]);

   if(existing.rowCount){
    await c.query(`
     update md_area_operation_group
     set is_active=true,updated_at=now()
     where id=$1
    `,[existing.rows[0].id]);
   }else{
    await c.query(`
     insert into md_area_operation_group(
      area_id,st_group,is_active
     )
     values($1,$2,true)
    `,[areaId,stGroup]);
   }
  }

  await c.query("commit");
  return NextResponse.json({ok:true});
 }catch(e){
  await c.query("rollback");
  return NextResponse.json(
   {error:e instanceof Error?e.message:String(e)},
   {status:500}
  );
 }finally{
  c.release();
 }
}
