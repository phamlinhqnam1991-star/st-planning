import type {PoolClient} from "pg";

/**
 * Áp dụng cấu hình 1 Operation hoàn chỉnh (KHÔNG rebuild chain).
 * Dùng chung cho POST /api/config/st-operation-flow và BULK thêm hàng loạt.
 * Rebuild (syncAllStDerived) do route gọi sau khi apply — bulk chỉ rebuild 1 lần.
 */

const isBlank=(v:unknown)=>v===null||v===undefined||v==="";

export type ApplyFlowPayload = {
  source_operation_code: string;
  source_operation_name?: string;
  source_planning_order?: number | null;
  operation_type?: "PLANNING_OPERATION" | "ST_SCOPE_ONLY";
  standard_operation?: string;
  st_group?: string;
  area_id?: number;
  schedule_area_code?: string;
  mapping_rule?: string;
  main_planning_order?: number | null;
  batch_prefix?: string | null;
  planner_owner?: string;
};

export const cleanCode = (v: unknown) => String(v ?? "").trim().toUpperCase();
export const clean = (v: unknown) => String(v ?? "").trim();
const RULES = new Set(["DIRECT", "OCCURRENCE", "SEQUENCE", "SEQUENCE/FALLBACK"]);

/** Kiểm tra payload — trả lỗi hoặc null nếu hợp lệ. Không ghi DB. */
export function validateApplyPayload(b: ApplyFlowPayload): string | null {
  const source = cleanCode(b.source_operation_code);
  const operationType = clean(b.operation_type || "PLANNING_OPERATION").toUpperCase();
  const standard = cleanCode(b.standard_operation);
  const stGroup = cleanCode(b.st_group);
  const areaId = Number(b.area_id);
  const scheduleArea = cleanCode(b.schedule_area_code);
  const mappingRule = clean(b.mapping_rule || "DIRECT").toUpperCase();
  const plannerOwner = clean(b.planner_owner).toUpperCase();
  const batchPrefix = clean(b.batch_prefix).toUpperCase() || null;

  if (!source || !["PLANNING_OPERATION", "ST_SCOPE_ONLY"].includes(operationType))
    return "Cần Operation Code và loại Operation hợp lệ.";
  if (operationType === "PLANNING_OPERATION" && (!standard || !stGroup || !areaId || !scheduleArea || !RULES.has(mappingRule) || !["1", "2"].includes(plannerOwner)))
    return "Planning Operation bắt buộc đủ Main Operation → ST Group → Physical Area → Schedule Area → Planner.";
  if (operationType === "PLANNING_OPERATION" && batchPrefix && !/^[A-Z0-9]{3}$/.test(batchPrefix))
    return "Batch Prefix phải đúng 3 ký tự.";
  return null;
}

export async function deactivateSourceMappings(
  c: PoolClient,
  source: string,
  action: "MOVE" | "DEACTIVATE",
  next?: { stGroup: string; standard: string; mappingRule: string }
) {
  const old = await c.query(
    `select * from md_st_operation_mapping where upper(trim(source_operation_code))=$1 and is_active=true for update`,
    [source]
  );
  for (const r of old.rows) {
    await c.query(
      `update md_st_operation_mapping set is_active=false,updated_at=now() where id=$1`,
      [r.id]
    );
    await c.query(
      `insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,old_st_group,new_st_group,old_standard_operation_rule,new_standard_operation_rule,old_mapping_rule,new_mapping_rule,changed_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,'system')`,
      [r.id, action, source, r.st_group, next?.stGroup || null, r.standard_operation_rule, next?.standard || null, r.mapping_rule, next?.mappingRule || null]
    );
  }
  return old.rowCount || 0;
}

/**
 * Ghi toàn bộ mapping liên quan cho 1 Operation Code (gọi trong transaction):
 * md_operation → md_st_operation_scope → md_st_group → md_operation_master →
 * md_planning_operation_scope → md_st_operation_mapping → md_area_operation_group →
 * md_schedule_area_operation → md_planner_work_assignment.
 * KHÔNG gọi syncAllStDerived — route gọi sau khi apply xong.
 */
export async function applyOperationFlow(c: PoolClient, b: ApplyFlowPayload) {
  const source = cleanCode(b.source_operation_code);
  const sourceName = clean(b.source_operation_name) || source;
  const sourceOrder = isBlank(b.source_planning_order) ? null : Number(b.source_planning_order);
  const operationType = (clean(b.operation_type || "PLANNING_OPERATION").toUpperCase()) as "PLANNING_OPERATION" | "ST_SCOPE_ONLY";
  const standard = cleanCode(b.standard_operation);
  const stGroup = cleanCode(b.st_group);
  const areaId = Number(b.area_id);
  const scheduleArea = cleanCode(b.schedule_area_code);
  const mappingRule = clean(b.mapping_rule || "DIRECT").toUpperCase();
  const mainOrder = isBlank(b.main_planning_order) ? null : Number(b.main_planning_order);
  const batchPrefix = clean(b.batch_prefix).toUpperCase() || null;
  const plannerOwner = clean(b.planner_owner).toUpperCase();

  const invalid = validateApplyPayload(b);
  if (invalid) throw new Error(invalid);

  await c.query(
    `insert into md_operation(operation_code,operation_name,planning_sort_order,is_active,updated_at)
     values($1,$2,$3,true,now())
     on conflict(operation_code) do update set
      operation_name=excluded.operation_name,
      planning_sort_order=excluded.planning_sort_order,
      is_active=true,updated_at=now()`,
    [source, sourceName, sourceOrder]
  );
  await c.query(
    `insert into md_st_operation_scope(operation_code,operation_type,previous_main_operation,next_main_operation,is_active)
     values($1,$2,$3,$4,true)
     on conflict(operation_code) do update set
      operation_type=excluded.operation_type,
      previous_main_operation=excluded.previous_main_operation,
      next_main_operation=excluded.next_main_operation,
      is_active=true,updated_at=now()`,
    [source, operationType, null, null]
  );


  if (operationType === "ST_SCOPE_ONLY") {
    await deactivateSourceMappings(c, source, "DEACTIVATE");
    await c.query(
      `update planning_job_operation set is_active=false,updated_at=now()
       where upper(trim(source_operation_code))=$1 and is_active=true`,
      [source]
    );
    return { source, operationType, standard: null };
  }

  await c.query(
    `insert into md_st_group(st_group,group_name,sort_order,is_active)
     values($1,$1,coalesce((select max(sort_order)+10 from md_st_group),10),true)
     on conflict(st_group) do update set is_active=true,updated_at=now()`,
    [stGroup]
  );
  await c.query(
    `insert into md_operation_master(standard_operation,st_group,planning_sort_order,batch_prefix,is_active,updated_at)
     values($1,$2,$3,$4,true,now())
     on conflict(standard_operation) do update set
      st_group=excluded.st_group,
      planning_sort_order=coalesce(excluded.planning_sort_order,md_operation_master.planning_sort_order),
      batch_prefix=coalesce(excluded.batch_prefix,md_operation_master.batch_prefix),
      is_active=true,updated_at=now()`,
    [standard, stGroup, mainOrder, batchPrefix]
  );
  await c.query(
    `insert into md_planning_operation_scope(standard_operation,sort_order,is_active,updated_at)
     values($1,coalesce($2,(select coalesce(max(sort_order),0)+10 from md_planning_operation_scope)),true,now())
     on conflict(standard_operation) do update set
      sort_order=coalesce($2,md_planning_operation_scope.sort_order),
      is_active=true,updated_at=now()`,
    [standard, mainOrder]
  );

  await deactivateSourceMappings(c, source, "MOVE", { stGroup, standard, mappingRule });
  const existing = await c.query(
    `select id from md_st_operation_mapping
     where upper(trim(source_operation_code))=$1 and st_group=$2 and standard_operation_rule=$3 limit 1`,
    [source, stGroup, standard]
  );
  let mappingId: number;
  if (existing.rowCount) {
    mappingId = Number(existing.rows[0].id);
    await c.query(
      `update md_st_operation_mapping set source_label=$2,mapping_rule=$3,is_active=true,updated_at=now() where id=$1`,
      [mappingId, sourceName, mappingRule]
    );
  } else {
    const ins = await c.query(
      `insert into md_st_operation_mapping(sort_order,st_group,source_operation_code,source_label,standard_operation_rule,mapping_rule,is_active)
       values(coalesce((select max(sort_order)+1 from md_st_operation_mapping),1),$1,$2,$3,$4,$5,true) returning id`,
      [stGroup, source, sourceName, standard, mappingRule]
    );
    mappingId = Number(ins.rows[0].id);
  }
  await c.query(
    `insert into md_st_operation_mapping_history(mapping_id,action,source_operation_code,new_st_group,new_standard_operation_rule,new_mapping_rule,changed_by)
     values($1,'ADD',$2,$3,$4,$5,'system')`,
    [mappingId, source, stGroup, standard, mappingRule]
  );

  await c.query(
    `update md_area_operation_group set is_active=false,updated_at=now() where st_group=$1 and is_active=true`,
    [stGroup]
  );
  await c.query(
    `insert into md_area_operation_group(area_id,st_group,is_active,updated_at)
     values($1,$2,true,now())
     on conflict(st_group) do update set area_id=excluded.area_id,is_active=true,updated_at=now()`,
    [areaId, stGroup]
  );
  await c.query(
    `update md_schedule_area_operation set is_active=false,updated_at=now() where standard_operation=$1 and is_active=true`,
    [standard]
  );
  await c.query(
    `insert into md_schedule_area_operation(schedule_area_code,standard_operation,is_active,updated_at)
     values($1,$2,true,now())
     on conflict(schedule_area_code,standard_operation) do update set is_active=true,updated_at=now()`,
    [scheduleArea, standard]
  );
  await c.query(
    `insert into md_planner_work_assignment(schedule_area_code,planner_owner,is_active,updated_by,updated_at)
     values($1,$2,true,'ST Operation Flow',now())
     on conflict(schedule_area_code) do update set planner_owner=excluded.planner_owner,is_active=true,updated_by=excluded.updated_by,updated_at=now()`,
    [scheduleArea, plannerOwner]
  );

  return { source, operationType, standard };
}
