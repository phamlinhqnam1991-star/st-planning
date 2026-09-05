import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {cleanCode,findOpenJobNumsUsingRawOperation,syncAllStDerived} from "@/lib/st-operation-flow";
import {invalidatePlanningStaticData} from "@/lib/planning/planning-static-cache";
import {invalidateConfigHealth} from "@/lib/config/config-health";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();
const RULES=new Set(["DIRECT","OCCURRENCE","SEQUENCE","SEQUENCE/FALLBACK"]);
const OPERATION_TYPES=new Set(["PLANNING_OPERATION","INTERMEDIATE","ST_SCOPE_ONLY"]);

async function deactivateSourceMappings(c:any,source:string,action:"MOVE"|"DEACTIVATE",next?:{
 stGroup:string;standard:string;mappingRule:string;
}){
 const old=await c.query(`select * from md_st_operation_mapping where upper(trim(source_operation_code))=$1 and is_active=true for update`,[source]);
 for(const r of old.rows){
  await c.query(`update md_st_operation_mapping set is_active=false,updated_at=now() where id=$1`,[r.id]);
  await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,old_st_group,new_st_group,old_standard_operation_rule,new_standard_operation_rule,old_mapping_rule,new_mapping_rule,changed_by)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,'system')`,[
    r.id,action,source,r.st_group,next?.stGroup||null,r.standard_operation_rule,next?.standard||null,r.mapping_rule,next?.mappingRule||null
   ]);
 }
 return old.rowCount||0;
}

export async function GET(){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
 const c=await getPool().connect();
 try{
  const [flowQ,rawQ,mainQ,groupQ,areaQ,scheduleQ]=await Promise.all([
   c.query(`
    with bridge_ops as (
      select upper(trim(bo.operation_code)) operation_code,
             count(distinct s.id)::int bridge_count,
             string_agg(distinct s.previous_main_operation||' → '||s.next_main_operation,', ' order by s.previous_main_operation||' → '||s.next_main_operation) bridge_summary
      from md_intermediate_bridge_operation bo
      join md_intermediate_bridge_segment s on s.id=bo.segment_id and s.is_active=true
      group by upper(trim(bo.operation_code))
    ), scope_rows as (
      select
       upper(trim(operation_code)) operation_code,
       case
        when bool_or(operation_type='ST_SCOPE_ONLY') then 'ST_SCOPE_ONLY'
        when bool_or(operation_type='INTERMEDIATE') then 'INTERMEDIATE'
        when bool_or(operation_type='PLANNING_OPERATION') then 'PLANNING_OPERATION'
        else null
       end st_scope_type
      from md_st_operation_scope
      where is_active=true
        and operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
      group by upper(trim(operation_code))
    ), catalog as (
      select
       s.operation_code,
       case when s.st_scope_type='INTERMEDIATE' then 'BRIDGE_INTERMEDIATE' else s.st_scope_type end operation_type,
       s.st_scope_type
      from scope_rows s
      where s.st_scope_type is not null
      union all
      select b.operation_code,'BRIDGE_INTERMEDIATE'::text operation_type,null::text st_scope_type
      from bridge_ops b
      where not exists(select 1 from scope_rows s where s.operation_code=b.operation_code)
    )
    select
      cat.operation_code,coalesce(o.operation_name,cat.operation_code) operation_name,o.planning_sort_order,
      (cat.st_scope_type is not null) st_scope,cat.operation_type,cat.st_scope_type,
      map.id mapping_id,map.mapping_rule,map.standard_operation_rule standard_operation,
      coalesce(map.st_group,om.st_group) st_group,
      a.id area_id,a.area_name,sa.schedule_area_code,sa.schedule_area_name,sa.planner_owner,
      coalesce(j.open_jobs,0)::int open_jobs,coalesce(bridge.bridge_count,0)::int bridge_count,bridge.bridge_summary,
      case
       when cat.operation_type='ST_SCOPE_ONLY' then 'ST_SCOPE_ONLY'
       when cat.operation_type='BRIDGE_INTERMEDIATE' and cat.st_scope_type='INTERMEDIATE' and coalesce(bridge.bridge_count,0)>0 then 'INTERMEDIATE_ST_SCOPE'
       when cat.operation_type='BRIDGE_INTERMEDIATE' and cat.st_scope_type='INTERMEDIATE' then 'INTERMEDIATE_ST_SCOPE_NO_BRIDGE'
       when cat.operation_type='BRIDGE_INTERMEDIATE' then 'INTERMEDIATE_BRIDGE'
       when map.id is null then 'MISSING_MAIN_MAPPING'
       when om.standard_operation is null then 'MISSING_MAIN_MASTER'
       when sg.st_group is null then 'MISSING_ST_GROUP'
       when a.id is null then 'MISSING_AREA'
       when sa.schedule_area_code is null then 'MISSING_SCHEDULE_AREA'
       when coalesce(sa.planner_owner,'UNASSIGNED')='UNASSIGNED' then 'MISSING_PLANNER_OWNER'
       else 'OK'
      end config_status
    from catalog cat
    left join bridge_ops bridge on bridge.operation_code=cat.operation_code
    left join lateral (
      select x.operation_name,x.planning_sort_order from md_operation x
      where upper(trim(x.operation_code))=cat.operation_code and x.is_active=true
      order by case when trim(x.operation_code)=cat.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code limit 1
    ) o on true
    left join lateral (
      select m.* from md_st_operation_mapping m
      where upper(trim(m.source_operation_code))=cat.operation_code and m.is_active=true
      order by m.updated_at desc,m.id desc limit 1
    ) map on true
    left join md_operation_master om on om.standard_operation=map.standard_operation_rule and om.is_active=true
    left join md_st_group sg on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
    left join md_area_operation_group ag on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
    left join md_area a on a.id=ag.area_id and a.is_active=true
    left join lateral (
      select s.schedule_area_code,s.schedule_area_name,coalesce(w.planner_owner,'UNASSIGNED') planner_owner
      from md_schedule_area_operation m
      join md_schedule_area s on s.schedule_area_code=m.schedule_area_code and s.is_active=true
      left join md_planner_work_assignment w on w.schedule_area_code=s.schedule_area_code and w.is_active=true
      where m.standard_operation=map.standard_operation_rule and m.is_active=true
      order by s.display_order,s.schedule_area_code limit 1
    ) sa on true
    left join lateral (
      select count(*)::int open_jobs from open_job_current j
      where j.is_open=true and upper(trim(j.next_operation))=cat.operation_code
    ) j on true
    order by o.planning_sort_order nulls last,cat.operation_code
   `),
   c.query(`
    with catalog as (
     select upper(trim(operation_code)) operation_code from md_operation where is_active=true
     union
     select upper(trim(next_operation)) operation_code from open_job_current where is_open=true and nullif(trim(coalesce(next_operation,'')),'') is not null
    )
    select c.operation_code,coalesce(o.operation_name,c.operation_code) operation_name,
           coalesce(j.open_jobs,0)::int open_jobs,
           exists(
            select 1 from md_st_operation_scope scope
            where scope.is_active=true
              and scope.operation_type in ('PLANNING_OPERATION','INTERMEDIATE','ST_SCOPE_ONLY')
              and upper(trim(scope.operation_code))=c.operation_code
           ) in_st_scope
    from catalog c
    left join lateral (
      select x.operation_name
      from md_operation x
      where x.is_active=true and upper(trim(x.operation_code))=c.operation_code
      order by case when trim(x.operation_code)=c.operation_code then 0 else 1 end,x.updated_at desc nulls last,x.operation_code
      limit 1
    ) o on true
    left join lateral (
      select count(*)::int open_jobs from open_job_current j
      where j.is_open=true and upper(trim(j.next_operation))=c.operation_code
    ) j on true
    order by case when coalesce(j.open_jobs,0)>0 then 0 else 1 end,c.operation_code
   `),
   c.query(`select standard_operation,st_group,planning_sort_order,batch_prefix from md_operation_master where is_active=true order by planning_sort_order nulls last,standard_operation`),
   c.query(`select st_group,group_name,sort_order from md_st_group where is_active=true order by sort_order,st_group`),
   c.query(`select id,area_code,area_name,sort_order from md_area where is_active=true order by sort_order,area_name`),
   c.query(`select schedule_area_code,schedule_area_name,display_order from md_schedule_area where is_active=true order by display_order,schedule_area_code`)
  ]);
  return NextResponse.json({
   flow:flowQ.rows,raw_operations:rawQ.rows,main_operations:mainQ.rows,
   st_groups:groupQ.rows,areas:areaQ.rows,schedule_areas:scheduleQ.rows
  });
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500})}
 finally{c.release()}
}

export async function POST(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const source=cleanCode(b.source_operation_code);
 const sourceName=clean(b.source_operation_name)||source;
 const sourceOrder=b.source_planning_order==null||b.source_planning_order===""?null:Number(b.source_planning_order);
 const operationType=clean(b.operation_type||"PLANNING_OPERATION").toUpperCase();
 const standard=clean(b.standard_operation).toUpperCase();
 const stGroup=cleanCode(b.st_group);
 const areaId=Number(b.area_id);
 const scheduleArea=cleanCode(b.schedule_area_code);
 const mappingRule=clean(b.mapping_rule||"DIRECT").toUpperCase();
 const mainOrder=b.main_planning_order==null||b.main_planning_order===""?null:Number(b.main_planning_order);
 const batchPrefix=clean(b.batch_prefix).toUpperCase()||null;
 const plannerOwner=clean(b.planner_owner).toUpperCase();
 if(!source||!OPERATION_TYPES.has(operationType))
  return NextResponse.json({error:"Cần Operation Code và loại Operation hợp lệ."},{status:400});
 if(operationType==="PLANNING_OPERATION"&&(!standard||!stGroup||!areaId||!scheduleArea||!RULES.has(mappingRule)||!["1","2"].includes(plannerOwner)))
  return NextResponse.json({error:"Planning Operation bắt buộc đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner."},{status:400});
 if(sourceOrder!==null&&!Number.isInteger(sourceOrder))return NextResponse.json({error:"Operation Code Order phải là số nguyên."},{status:400});
 if(operationType==="PLANNING_OPERATION"&&mainOrder!==null&&!Number.isInteger(mainOrder))return NextResponse.json({error:"Main Planning Order phải là số nguyên."},{status:400});
 if(operationType==="PLANNING_OPERATION"&&batchPrefix&&!/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(batchPrefix))return NextResponse.json({error:"Batch Prefix: 1-30 ký tự A-Z, 0-9, _ hoặc -."},{status:400});

 const c=await getPool().connect();
 try{
  await c.query("begin");

  // V419: INTERMEDIATE is a Dashboard-only ST membership tag.
  // It must never mutate Planning Mapping, Planning Chain, Candidate, Batch or Schedule.
  // Bridge remains the only source that decides Previous/Next Main and INTERMEDIATE role.
  if(operationType==="INTERMEDIATE"){
   const bridgeQ=await c.query(`
    select count(distinct s.id)::int bridge_count
    from md_intermediate_bridge_operation bo
    join md_intermediate_bridge_segment s on s.id=bo.segment_id and s.is_active=true
    where upper(trim(bo.operation_code))=$1
   `,[source]);
   const bridgeCount=Number(bridgeQ.rows[0]?.bridge_count||0);
   if(bridgeCount<=0){
    await c.query("rollback");
    return NextResponse.json({error:"INTERMEDIATE Dashboard chỉ được đánh dấu cho Operation đang tồn tại trong active Auto/Manual Bridge."},{status:400});
   }

   const priorScopeQ=await c.query(`
    select upper(trim(operation_type)) operation_type,is_active
    from md_st_operation_scope
    where upper(trim(operation_code))=$1
    limit 1
    for update
   `,[source]);
   const priorType=clean(priorScopeQ.rows[0]?.operation_type).toUpperCase();
   const priorActive=Boolean(priorScopeQ.rows[0]?.is_active);
   if(priorActive&&priorType&&priorType!=="INTERMEDIATE"){
    await c.query("rollback");
    return NextResponse.json({
     error:`${source} đang là ${priorType}. Không thể đổi sang INTERMEDIATE Dashboard vì thao tác này phải tuyệt đối không thay đổi Planning Scope.`
    },{status:409});
   }

   const activeMappingQ=await c.query(`
    select 1
    from md_st_operation_mapping
    where is_active=true and upper(trim(source_operation_code))=$1
    limit 1
   `,[source]);
   if(activeMappingQ.rowCount){
    await c.query("rollback");
    return NextResponse.json({
     error:`${source} đang có active Source → Main Mapping. Hãy giữ nguyên Planning configuration; INTERMEDIATE Dashboard chỉ dùng cho Bridge operation không phải Planning source.`
    },{status:409});
   }

   await c.query(`
    insert into md_st_operation_scope(operation_code,operation_type,previous_main_operation,next_main_operation,is_active)
    values($1,'INTERMEDIATE',null,null,true)
    on conflict(operation_code) do update set
     operation_type='INTERMEDIATE',previous_main_operation=null,next_main_operation=null,
     is_active=true,updated_at=now()
   `,[source]);

   await c.query("commit");
   invalidateConfigHealth();
   return NextResponse.json({
    ok:true,
    source_operation_code:source,
    operation_type:"INTERMEDIATE",
    dashboard_only:true,
    bridge_count:bridgeCount,
    standard_operation:null,
    sync:null
   });
  }

  // Operational scope types continue to use the existing Planning sync path.
  // A Dashboard-only INTERMEDIATE tag is deliberately not counted as an existing
  // operational configuration when converting the code to PLANNING/ST_SCOPE_ONLY.
  const wasConfiguredQ=await c.query(`
    select 1
    from md_st_operation_scope
    where is_active=true
      and operation_type in ('PLANNING_OPERATION','ST_SCOPE_ONLY')
      and upper(trim(operation_code))=$1
    limit 1
  `,[source]);
  const wasConfigured=Boolean(wasConfiguredQ.rowCount);
  const affectedJobNums=wasConfigured?[]:await findOpenJobNumsUsingRawOperation(c,source);

  await c.query(`
   insert into md_operation(operation_code,operation_name,planning_sort_order,is_active,updated_at)
   values($1,$2,$3,true,now())
   on conflict(operation_code) do update set
    operation_name=excluded.operation_name,
    planning_sort_order=excluded.planning_sort_order,
    is_active=true,updated_at=now()
  `,[source,sourceName,sourceOrder]);
  await c.query(`
   insert into md_st_operation_scope(operation_code,operation_type,previous_main_operation,next_main_operation,is_active)
   values($1,$2,$3,$4,true)
   on conflict(operation_code) do update set
    operation_type=excluded.operation_type,
    previous_main_operation=excluded.previous_main_operation,
    next_main_operation=excluded.next_main_operation,
    is_active=true,updated_at=now()
  `,[source,operationType,null,null]);

  if(operationType==="ST_SCOPE_ONLY"){
   const deactivatedMappings=await deactivateSourceMappings(c,source,"DEACTIVATE");

   // Historical Batch/Schedule rows remain in their own tables, but this raw
   // Operation must disappear from every active Planning/Batch candidate.
   await c.query(`
    update planning_job_operation
       set is_active=false,updated_at=now()
     where upper(trim(source_operation_code))=$1
       and is_active=true
   `,[source]);

   const sync=wasConfigured
    ?await syncAllStDerived(c)
    :await syncAllStDerived(c,{jobNums:affectedJobNums});
   await c.query("commit");
   invalidatePlanningStaticData();
   invalidateConfigHealth();
   return NextResponse.json({
    ok:true,
    source_operation_code:source,
    operation_type:operationType,
    standard_operation:null,
    deactivated_mappings:deactivatedMappings,
    sync
   });
  }

  await c.query(`
   insert into md_st_group(st_group,group_name,sort_order,is_active)
   values($1,$1,coalesce((select max(sort_order)+10 from md_st_group),10),true)
   on conflict(st_group) do update set is_active=true,updated_at=now()
  `,[stGroup]);
  await c.query(`
   insert into md_operation_master(standard_operation,st_group,planning_sort_order,batch_prefix,is_active,updated_at)
   values($1,$2,$3,$4,true,now())
   on conflict(standard_operation) do update set
    st_group=excluded.st_group,
    planning_sort_order=coalesce(excluded.planning_sort_order,md_operation_master.planning_sort_order),
    batch_prefix=coalesce(excluded.batch_prefix,md_operation_master.batch_prefix),
    is_active=true,updated_at=now()
  `,[standard,stGroup,mainOrder,batchPrefix]);
  await c.query(`
   insert into md_planning_operation_scope(standard_operation,sort_order,is_active,updated_at)
   values($1,coalesce($2,(select coalesce(max(sort_order),0)+10 from md_planning_operation_scope)),true,now())
   on conflict(standard_operation) do update set
    sort_order=coalesce($2,md_planning_operation_scope.sort_order),
    is_active=true,updated_at=now()
  `,[standard,mainOrder]);

  await deactivateSourceMappings(c,source,"MOVE",{stGroup,standard,mappingRule});
  const existing=await c.query(`select id from md_st_operation_mapping where upper(trim(source_operation_code))=$1 and st_group=$2 and standard_operation_rule=$3 limit 1`,[source,stGroup,standard]);
  let mappingId:number;
  if(existing.rowCount){
   mappingId=Number(existing.rows[0].id);
   await c.query(`update md_st_operation_mapping set source_label=$2,mapping_rule=$3,is_active=true,updated_at=now() where id=$1`,[mappingId,sourceName,mappingRule]);
  }else{
   const ins=await c.query(`insert into md_st_operation_mapping(sort_order,st_group,source_operation_code,source_label,standard_operation_rule,mapping_rule,is_active)
    values(coalesce((select max(sort_order)+1 from md_st_operation_mapping),1),$1,$2,$3,$4,$5,true) returning id`,[stGroup,source,sourceName,standard,mappingRule]);
   mappingId=Number(ins.rows[0].id);
  }
  await c.query(`insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,new_st_group,new_standard_operation_rule,new_mapping_rule,changed_by)
   values($1,'ADD',$2,$3,$4,$5,'system')`,[mappingId,source,stGroup,standard,mappingRule]);

  await c.query(`update md_area_operation_group set is_active=false,updated_at=now() where st_group=$1 and is_active=true`,[stGroup]);
  await c.query(`
   insert into md_area_operation_group(area_id,st_group,is_active,updated_at)
   values($1,$2,true,now())
   on conflict(st_group) do update set area_id=excluded.area_id,is_active=true,updated_at=now()
  `,[areaId,stGroup]);
  await c.query(`update md_schedule_area_operation set is_active=false,updated_at=now() where standard_operation=$1 and is_active=true`,[standard]);
  await c.query(`
   insert into md_schedule_area_operation(schedule_area_code,standard_operation,is_active,updated_at)
   values($1,$2,true,now())
   on conflict(schedule_area_code,standard_operation) do update set is_active=true,updated_at=now()
  `,[scheduleArea,standard]);
  await c.query(`
   insert into md_planner_work_assignment(schedule_area_code,planner_owner,is_active,updated_by,updated_at)
   values($1,$2,true,'ST Operation Flow',now())
   on conflict(schedule_area_code) do update set planner_owner=excluded.planner_owner,is_active=true,updated_by=excluded.updated_by,updated_at=now()
  `,[scheduleArea,plannerOwner]);

  const sync=wasConfigured
   ?await syncAllStDerived(c)
   :await syncAllStDerived(c,{jobNums:affectedJobNums});
  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({ok:true,source_operation_code:source,operation_type:operationType,standard_operation:standard,sync});
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release()}
}

export async function DELETE(req:Request){
 const {denied}=await requireApiPermission("config.edit");if(denied)return denied;
 const b=await req.json().catch(()=>({}));
 const source=cleanCode(b.source_operation_code);
 const fullRebuild=Boolean(b.full_rebuild);
 if(!source)return NextResponse.json({error:"Thiếu Source Operation Code."},{status:400});
 const c=await getPool().connect();
 try{
  await c.query("begin");
  const priorScopeQ=await c.query(`
   select upper(trim(operation_type)) operation_type
   from md_st_operation_scope
   where is_active=true and upper(trim(operation_code))=$1
   limit 1
   for update
  `,[source]);
  const priorOperationType=clean(priorScopeQ.rows[0]?.operation_type).toUpperCase();

  // Removing the explicit ST tag from an INTERMEDIATE must not touch the Auto/Manual
  // Bridge, Main mappings, Planning Scope or Planning Chain. The Bridge is a separate
  // resolver source; this row is only ST membership for Dashboard filtering.
  if(priorOperationType==="INTERMEDIATE"){
   await c.query(`
    update md_st_operation_scope
       set is_active=false,updated_at=now()
     where upper(trim(operation_code))=$1
       and is_active=true
       and operation_type='INTERMEDIATE'
   `,[source]);
   await c.query("commit");
   invalidateConfigHealth();
   return NextResponse.json({
    ok:true,
    source_operation_code:source,
    quick:true,
    sync:null,
    note:"Đã bỏ nhãn INTERMEDIATE khỏi ST Scope. Auto/Manual Bridge và Planning Chain không thay đổi."
   });
  }

  // v234: khớp theo chuẩn hóa (upper+trim) thay vì khớp chính xác — nếu bảng scope có
  // dòng trùng 'bẩn' (khác hoa/thường, thừa khoảng trắng), lệnh cũ insert on conflict
  // không đụng tới dòng bẩn → operation vẫn hiện trên trang. UPDATE theo chuẩn hóa
  // tắt TẤT CẢ dòng khớp (is_active=false), không phụ thuộc ràng buộc unique.
  await c.query(`update md_st_operation_scope set is_active=false,updated_at=now()
   where upper(trim(operation_code))=upper(trim($1)) and is_active=true`,[source]);
  await c.query(`update md_st_operation_mapping set is_active=false,updated_at=now()
   where upper(trim(source_operation_code))=upper(trim($1)) and is_active=true`,[source]);
  // v231: xóa nhanh — ngưng ngay dòng Planning Chain của code này để Job biến khỏi bảng
  // tức thì (không đợi rebuild toàn bộ). Dữ liệu dẫn xuất (ST routing summary) sẽ được
  // làm sạch đầy đủ ở lần Rebuild Chain / lần cấu hình kế tiếp.
  await c.query(`update planning_job_operation set is_active=false,updated_at=now()
   where upper(trim(source_operation_code))=$1 and is_active=true`,[source]);
  // v235: đồng bộ Planning Scope — tắt main nào KHÔNG còn mapping từ source đang hoạt động.
  // Cột ma trận Candidate Jobs đọc md_planning_operation_scope; nếu không dọn, main đã mất
  // nguồn vẫn hiện cột trên Board dù không còn trong danh sách "Các công đoạn được hiển thị".
  await c.query(`
   with mapped_mains as (
    select distinct trim(upper(x)) main
    from md_st_operation_mapping m
    join md_st_operation_scope sc
      on upper(trim(sc.operation_code))=upper(trim(m.source_operation_code))
     and sc.is_active=true
     and sc.operation_type='PLANNING_OPERATION'
    cross join lateral unnest(string_to_array(m.standard_operation_rule,'/')) x
    where m.is_active=true and trim(x)<>''
   )
   update md_planning_operation_scope ps
   set is_active=false, updated_at=now()
   where ps.is_active=true
    and not exists (
     select 1 from mapped_mains mm
     where exists (select 1 from unnest(string_to_array(ps.standard_operation,'/')) y
       where trim(upper(y))=mm.main)
    )`);
  await c.query(`
   with mapped_mains as (
    select distinct trim(upper(x)) main
    from md_st_operation_mapping m
    join md_st_operation_scope sc
      on upper(trim(sc.operation_code))=upper(trim(m.source_operation_code))
     and sc.is_active=true
     and sc.operation_type='PLANNING_OPERATION'
    cross join lateral unnest(string_to_array(m.standard_operation_rule,'/')) x
    where m.is_active=true and trim(x)<>''
   )
   update md_schedule_area_operation sa
   set is_active=false, updated_at=now()
   where sa.is_active=true
    and not exists (
     select 1 from mapped_mains mm
     where exists (select 1 from unnest(string_to_array(sa.standard_operation,'/')) y
       where trim(upper(y))=mm.main)
    )`);
  let sync:unknown=null;
  if(fullRebuild){
   sync=await syncAllStDerived(c);
  }
  await c.query("commit");
  invalidatePlanningStaticData();
  invalidateConfigHealth();
  return NextResponse.json({
   ok:true,
   source_operation_code:source,
   quick:!fullRebuild,
   sync,
   note:fullRebuild
    ?"Đã bỏ khỏi ST và dựng lại toàn bộ chuỗi công đoạn."
    :"Đã bỏ khỏi ST (nhanh). Job của công đoạn này đã biến khỏi bảng. Nên bấm Rebuild Chain trên Planning Board để làm sạch chuỗi khi thuận tiện."
  });
 }catch(e){
  try{await c.query("rollback")}catch{}
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release()}
}
