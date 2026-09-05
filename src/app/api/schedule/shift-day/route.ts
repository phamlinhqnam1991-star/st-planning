import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

function isIsoDate(value:unknown){
 return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);
}

function shiftDate(date:string,days:number){
 const [y,m,d]=date.split("-").map(Number);
 const x=new Date(Date.UTC(y,m-1,d+days));
 return x.toISOString().slice(0,10);
}

export async function POST(req:Request){
 const {denied}=await requireApiPermission("schedule.edit");
 if(denied)return denied;

 const body=await req.json().catch(()=>({}));
 const sourceDate=String(body.sourceDate||"").trim();
 const direction=Number(body.direction);

 if(!isIsoDate(sourceDate))
  return NextResponse.json({error:"Ngày nguồn không hợp lệ."},{status:400});
 if(direction!==1&&direction!==-1)
  return NextResponse.json({error:"Direction chỉ được là +1 hoặc -1 ngày."},{status:400});

 const targetDate=shiftDate(sourceDate,direction);
 const c=await getPool().connect();
 try{
  await c.query("begin");

  // V444 · Trial day = production day 06:00 -> 06:00 next day, KHÔNG phải calendar date.
  // Vì vậy lô bắt đầu 00:xx-05:59 của ngày kế tiếp vẫn thuộc ngày sản xuất nguồn
  // và phải MOVE cùng cả ngày (không bị hiểu nhầm là lịch độc lập của ngày đích).
  const sourceQ=await c.query(`
   select
    s.id,s.batch_id,s.status,s.resource_code,s.schedule_date,
    s.planned_start,s.planned_end,
    coalesce(b.batch_no,'LEGACY-'||s.batch_id::text) batch_no
   from planning_schedule s
   left join planning_batch b on b.id=s.batch_id
   where s.status<>'CANCELLED'
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
   order by s.planned_start,s.resource_code,s.id
   for update of s
  `,[sourceDate]);

  if(!sourceQ.rowCount)
   throw new Error(`Không có lô điều độ nào ở ngày ${sourceDate}.`);

  const blocked=sourceQ.rows.filter((x:any)=>["RUNNING","COMPLETED"].includes(String(x.status||"").toUpperCase()));
  if(blocked.length){
   const names=blocked.slice(0,8).map((x:any)=>x.batch_no).join(", ");
   throw new Error(`Không thể dời cả ngày vì có ${blocked.length} lô RUNNING/COMPLETED${names?`: ${names}`:""}.`);
  }

  const sourceIds=sourceQ.rows.map((x:any)=>Number(x.id));

  // Trial mode chỉ giữ một PRODUCTION DAY. Chỉ lịch độc lập có Start nằm trong
  // 06:00 ngày đích -> 06:00 ngày kế tiếp mới được xem là population ngày đích.
  // Các lô nguồn bắt đầu sau 00:00 nhưng trước 06:00 đã nằm trong sourceIds ở trên.
  const targetQ=await c.query(`
   select
    count(*)::int total,
    array_agg(coalesce(b.batch_no,'LEGACY-'||s.batch_id::text) order by s.planned_start,s.id) batch_nos
   from planning_schedule s
   left join planning_batch b on b.id=s.batch_id
   where s.status<>'CANCELLED'
     and not (s.id=any($2::bigint[]))
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
  `,[targetDate,sourceIds]);
  const targetCount=Number(targetQ.rows[0]?.total||0);
  if(targetCount>0){
   const names=(targetQ.rows[0]?.batch_nos||[]).slice(0,8).join(", ");
   throw new Error(`Ngày sản xuất đích ${targetDate} (06:00 → 06:00) đã có ${targetCount} lô độc lập${names?`: ${names}`:""}. Hệ thống không tự gộp hoặc xóa lịch ngày đích.`);
  }

  // Bảo vệ thêm cho lô dài qua ngày: không cho một lịch ngoài population nguồn
  // đang chạy xuyên vào toàn khoảng thời gian sau khi dời.
  const boundsQ=await c.query(`
   select
    min(planned_start + ($2::int * interval '1 day')) shifted_min,
    max(planned_end   + ($2::int * interval '1 day')) shifted_max
   from planning_schedule
   where id=any($1::bigint[])
  `,[sourceIds,direction]);
  const shiftedMin=boundsQ.rows[0]?.shifted_min;
  const shiftedMax=boundsQ.rows[0]?.shifted_max;
  const crossingQ=await c.query(`
   select count(*)::int total
   from planning_schedule s
   where s.status<>'CANCELLED'
     and not (s.id=any($1::bigint[]))
     and s.planned_start<$3::timestamptz
     and s.planned_end>$2::timestamptz
  `,[sourceIds,shiftedMin,shiftedMax]);
  if(Number(crossingQ.rows[0]?.total||0)>0)
   throw new Error(`Khoảng thời gian ngày đích đang có lịch khác chạy xuyên qua. Hệ thống không dời để tránh conflict.`);

  const movedQ=await c.query(`
   update planning_schedule
   set
    schedule_date=((((planned_start + ($2::int * interval '1 day')) at time zone 'Asia/Ho_Chi_Minh') - interval '6 hours')::date),
    planned_start=planned_start + ($2::int * interval '1 day'),
    planned_end=planned_end + ($2::int * interval '1 day'),
    loading_start=case when loading_start is null then null else loading_start + ($2::int * interval '1 day') end,
    loading_end=case when loading_end is null then null else loading_end + ($2::int * interval '1 day') end,
    process_start=case when process_start is null then null else process_start + ($2::int * interval '1 day') end,
    process_end=case when process_end is null then null else process_end + ($2::int * interval '1 day') end,
    ndt_start=case when ndt_start is null then null else ndt_start + ($2::int * interval '1 day') end,
    ndt_end=case when ndt_end is null then null else ndt_end + ($2::int * interval '1 day') end,
    unloading_start=case when unloading_start is null then null else unloading_start + ($2::int * interval '1 day') end,
    unloading_end=case when unloading_end is null then null else unloading_end + ($2::int * interval '1 day') end,
    updated_at=now()
   where id=any($1::bigint[])
   returning id,batch_id,schedule_date,planned_start,planned_end
  `,[sourceIds,direction]);

  // Batch vẫn là Batch cũ; chỉ đồng bộ lại planned window theo Schedule đã move.
  await c.query(`
   update planning_batch b
   set planned_start=s.planned_start,
       planned_end=s.planned_end,
       updated_at=now()
   from planning_schedule s
   where s.id=any($1::bigint[])
     and b.id=s.batch_id
  `,[sourceIds]);

  // All-or-nothing invariant: sau MOVE, production day nguồn 06:00 -> 06:00
  // không còn schedule active có Start thuộc ngày sản xuất đó.
  const oldDateQ=await c.query(`
   select count(*)::int total
   from planning_schedule s
   where s.status<>'CANCELLED'
     and s.planned_start >= (($1::date + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
     and s.planned_start <  (($1::date + interval '1 day' + interval '6 hours') at time zone 'Asia/Ho_Chi_Minh')
  `,[sourceDate]);
  if(Number(oldDateQ.rows[0]?.total||0)!==0)
   throw new Error("Dời ngày chưa hoàn tất: ngày sản xuất nguồn 06:00 → 06:00 vẫn còn lô. Transaction đã được rollback.");

  await c.query("commit");
  return NextResponse.json({
   ok:true,
   sourceDate,
   targetDate,
   direction,
   moved:Number(movedQ.rowCount||0),
   oldDateRemaining:0
  });
 }catch(error:any){
  await c.query("rollback");
  return NextResponse.json({error:error?.message||"Không thể dời ngày điều độ."},{status:400});
 }finally{
  c.release();
 }
}
