// =====================================================================
// 🔧 Sửa dữ liệu Loading cũ (v221)
//
// Vấn đề: dữ liệu lưu bởi phiên bản cũ (trước v210) đặt Loading = 0 phút
// cho MỌI lô có công đoạn trước → Loading Start = Process Start (sai).
// Code hiện tại chỉ đặt Loading 0 khi lô NỐI TIẾP thật (lô trước cùng FB
// vừa xong sát giờ). Nút này rà toàn bộ lịch Chemical Line:
//   - Lô có Loading = 0 mà có lịch KHÁC cùng FB kết thúc trong ±5 phút
//     trước Loading Start → NỐI TIẾP THẬT → giữ nguyên (không sửa).
//   - Còn lại → tính lại Loading Duration theo quy tắc Qty/Surface
//     (md_chemical_handling_time_rule), đẩy Process/NDT/Unloading tương
//     ứng (giữ nguyên Loading Start làm điểm neo), kiểm tra ràng buộc
//     điều độ rồi lưu lại. Không sửa được (bị cấn giờ) → báo cáo rõ.
// =====================================================================
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {
 assertResourceAndChemicalCapacity,
 chemicalScheduleColumns,
 resolveChemicalScheduleWindow
} from "@/lib/chemical-line-schedule-server";

export const runtime="nodejs";
export const maxDuration=60;

export async function POST(){
 const denied=await requireApiUser();
 if(denied)return denied;
 const pool=getPool();
 const client=await pool.connect();

 try{
  await client.query("begin");

  // 1. Lô nghi vấn: Chemical Line, Loading = 0 phút, Process Start trùng Loading Start.
  const candQ=await client.query(`
   select
    s.id,s.batch_id,s.resource_code,s.planned_start,
    s.loading_start,s.process_start,s.process_duration_minutes,
    b.batch_no,b.total_qty,b.total_surface_dm2,
    pr.recipe_no
   from planning_schedule s
   join planning_batch b
     on b.id=s.batch_id
    and b.status<>'CANCELLED'
   left join md_process_recipe pr
     on pr.recipe_key=b.recipe_key
    and pr.is_active=true
   join md_schedule_resource r
     on r.resource_code=s.resource_code
   where s.status<>'CANCELLED'
     and r.resource_group='CHEMICAL_LINE'
     and coalesce(s.loading_duration_minutes,0)=0
     and s.loading_start is not null
     and s.process_start is not null
     and abs(extract(epoch from (s.process_start-s.loading_start)))<=60
   order by s.loading_start,s.id
  `);

  const fixed:any[]=[];
  const kept:any[]=[];
  const failed:any[]=[];
  // Lô sớm hơn được ưu tiên: khi kiểm tra lô đang xử lý, loại các lô nghi vấn
  // CHƯA xử lý (có giờ sau) ra khỏi kiểm tra chồng lấn — chúng sẽ tự bị báo
  // cấn giờ nếu thật sự không còn chỗ. Lô đã xử lý (giờ mới đã lưu) vẫn được tính.
  const candidateIds=(candQ.rows as any[]).map((r:any)=>Number(r.id));

  for(let idx=0;idx<candQ.rows.length;idx++){
   const row=candQ.rows[idx];
   const loadingStart=new Date(String(row.loading_start));
   const batchNo=String(row.batch_no||("schedule #"+row.id));
   const resourceCode=String(row.resource_code||"");

   // 2. Nối tiếp thật? Lịch khác cùng FB kết thúc trong ±5 phút quanh Loading Start.
   const contQ=await client.query(`
    select b2.batch_no,s2.planned_end
    from planning_schedule s2
    left join planning_batch b2 on b2.id=s2.batch_id
    where s2.resource_code=$1
      and s2.status<>'CANCELLED'
      and s2.id<>$2
      and s2.planned_end is not null
      and s2.planned_end between $3::timestamptz - interval '5 minutes'
                             and $3::timestamptz + interval '5 minutes'
    order by s2.planned_end
    limit 1
   `,[resourceCode,Number(row.id),loadingStart]);

   if(contQ.rowCount){
    kept.push({batch_no:batchNo,resource_code:resourceCode,previous:String((contQ.rows[0] as any).batch_no||"—")});
    continue;
   }

   // 3. Tính lại window với Loading Start làm điểm neo.
   const processMinutes=Math.round(Number(row.process_duration_minutes||0));
   if(!(processMinutes>0)){
    failed.push({batch_no:batchNo,resource_code:resourceCode,reason:"thiếu Process Duration"});
    continue;
   }

   try{
    const window=await resolveChemicalScheduleWindow(client,{
     loadingStart,
     processMinutes,
     totalQty:Number(row.total_qty||0),
     totalSurfaceDm2:Number(row.total_surface_dm2||0),
     recipeNo:row.recipe_no,
     excludeScheduleId:Number(row.id)
    });

    const resQ=await client.query(`
     select resource_code,resource_group,max_concurrent
     from md_schedule_resource
     where resource_code=$1
     limit 1
    `,[resourceCode]);
    const resource=resQ.rows[0];

    await assertResourceAndChemicalCapacity(client,{
     resourceCode,
     resourceGroup:String(resource?.resource_group||"CHEMICAL_LINE"),
     window,
     maxConcurrent:Number(resource?.max_concurrent||3),
     excludeScheduleId:Number(row.id),
     // Loại các lô nghi vấn chưa xử lý (giờ sau) — lô sớm hơn giữ vị trí.
     excludeScheduleIds:candidateIds.slice(idx+1)
    });

    const cols=chemicalScheduleColumns(window);

    await client.query(`
     update planning_schedule
     set planned_end=$2,
         duration_minutes=$3,
         loading_end=$4,
         loading_duration_minutes=$5,
         process_start=$6,
         process_end=$7,
         process_duration_minutes=$8,
         ndt_start=$9,
         ndt_end=$10,
         ndt_duration_minutes=$11,
         unloading_start=$12,
         unloading_end=$13,
         unloading_duration_minutes=$14,
         updated_at=now()
     where id=$1
    `,[
     Number(row.id),
     cols.unloadingEnd,
     cols.durationMinutes,
     cols.loadingEnd,
     cols.loadingDurationMinutes,
     cols.processStart,
     cols.processEnd,
     cols.processDurationMinutes,
     cols.ndtStart,
     cols.ndtEnd,
     cols.ndtDurationMinutes,
     cols.unloadingStart,
     cols.unloadingEnd,
     cols.unloadingDurationMinutes
    ]);

    await client.query(`
     update planning_batch
     set planned_end=$2,
         updated_at=now()
     where id=$1
    `,[Number(row.batch_id),cols.unloadingEnd]);

    fixed.push({
     batch_no:batchNo,
     resource_code:resourceCode,
     loading_minutes:cols.loadingDurationMinutes,
     loading_start:cols.loadingStart.toISOString(),
     process_start:cols.processStart.toISOString()
    });
   }catch(e){
    failed.push({
     batch_no:batchNo,
     resource_code:resourceCode,
     reason:e instanceof Error?e.message:"lỗi không xác định"
    });
   }
  }

  await client.query("commit");

  return Response.json({
   ok:true,
   fixed,
   fixedCount:fixed.length,
   kept,
   keptCount:kept.length,
   failed,
   failedCount:failed.length
  });
 }catch(e){
  await client.query("rollback").catch(()=>{});
  return Response.json({
   ok:false,
   error:e instanceof Error?e.message:"Lỗi không xác định khi sửa dữ liệu Loading."
  },{status:400});
 }finally{
  client.release();
 }
}
