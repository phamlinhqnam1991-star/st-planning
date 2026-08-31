import type {PoolClient} from "pg";

/**
 * Job đang mở nhưng KHÔNG hiển thị trên Planning Board:
 * không có dòng planning_job_operation trạng thái ELIGIBLE/PLANNED.
 * Chia theo lý do để người vận hành biết xử lý từng nhóm.
 */

export type MissingGroup = { ly_do: string; so_job: number };
export type MissingRow = {
  job_num: string;
  part_num: string;
  next_operation: string;
  last_operation: string | null;
  so_luong: number;
  ly_do: string;
  so_dong_chain: number;
};

const REASON_SQL = `case
    when exists (
      select 1 from md_intermediate_bridge_operation bo
      join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
      where upper(trim(bo.operation_code))=upper(trim(j.next_operation))
    ) and not exists (
      select 1 from planning_job_operation po where po.job_num=j.job_num and po.is_active=true
    ) then '4I. AUTO INTERMEDIATE có Segment nhưng chưa có canonical Planning Chain / Next Main không có trong AllOperation'
    when exists (
      select 1 from md_intermediate_bridge_operation bo
      join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
      where upper(trim(bo.operation_code))=upper(trim(j.next_operation))
    ) then '5I. Intermediate Segment đã resolve nhưng chain chưa READY (cần Rebuild Chain / kiểm tra dữ liệu)' 
    when s.operation_code is null then '1. NextOperation CHƯA khai báo Main Planning/ST Scope và không thuộc Auto Bridge'
    when s.operation_type='ST_SCOPE_ONLY' then '2. NextOperation loại ST_SCOPE_ONLY (chỉ hiển thị)'
    when m.id is null then '3. Thuộc ST nhưng CHƯA gán Source → Main Mapping'
    when not exists (
      select 1 from planning_job_operation po
      where po.job_num=j.job_num and po.is_active=true
    ) then '4. Cấu hình đủ nhưng CHƯA có Planning Chain (cần Rebuild Chain)'
    else '5. Có chain nhưng chưa có dòng READY/PLANNED (chain stale hoặc cần Rebuild Chain)'
  end`;

const FROM_SQL = `from open_job_current j
  left join md_st_operation_scope s
    on upper(trim(s.operation_code))=upper(trim(j.next_operation))
   and s.is_active=true
  left join md_st_operation_mapping m
    on upper(trim(m.source_operation_code))=upper(trim(j.next_operation))
   and m.is_active=true
  where j.is_open=true
    and not exists (
      select 1 from planning_job_operation po
      where po.job_num=j.job_num and po.is_active=true
        and po.status in ('ELIGIBLE','PLANNED')
    )`;

export async function missingConfigJobs(c: PoolClient) {
  const groupsQ = await c.query(
    `select ${REASON_SQL} ly_do, count(*)::int so_job ${FROM_SQL} group by 1 order by 1`
  );
  const rowsQ = await c.query(
    `select
       j.job_num,j.part_num,j.next_operation,j.last_operation,
       coalesce(nullif(j.current_good_wip_qty,0),j.prod_qty,0) so_luong,
       ${REASON_SQL} ly_do,
       (select count(*) from planning_job_operation po
        where po.job_num=j.job_num and po.is_active=true) so_dong_chain
     ${FROM_SQL}
     order by j.next_operation,j.job_num
     limit 300`
  );
  const groups = (groupsQ.rows || []) as MissingGroup[];
  return {
    total: groups.reduce((a, g) => a + Number(g.so_job || 0), 0),
    groups,
    rows: (rowsQ.rows || []) as MissingRow[],
  };
}

/** Đếm gọn (dùng cho Tổng quan Cấu hình / sidebar). */
export async function missingConfigJobCount(c: PoolClient): Promise<number> {
  const q = await c.query(`select count(*)::int so_job ${FROM_SQL}`);
  return Number(q.rows[0]?.so_job || 0);
}

/** Gợi ý mapping từ bảng tĩnh ST_OPERATION_MAPPING (chỉ dùng mục DIRECT). */
import {ST_OPERATION_MAPPING} from "@/data/master-config";

export type MissingOperation = {
  operation_code: string;
  so_job: number;
  nhom: string; // 1..5
  suggested_main: string;
  suggested_st_group: string | null;
  suggested_rule: string;
};

export const OPERATION_GROUP_LABEL: Record<string, string> = {
  "1": "Chưa khai báo ST Scope",
  "2": "Loại ST_SCOPE_ONLY (chỉ hiển thị)",
  "4I": "AUTO INTERMEDIATE chưa có canonical chain",
  "5I": "AUTO INTERMEDIATE đang chờ Main trước",
  "3": "Thuộc ST nhưng chưa mapping",
  "4": "Đủ cấu hình nhưng chưa Rebuild Chain",
  "5": "Có chain nhưng chưa có dòng sẵn sàng",
};

/** Các Operation đang có Job "mất tích" — gom theo mã + gợi ý công đoạn chính. */
export async function missingOperations(c: PoolClient): Promise<MissingOperation[]> {
  const q = await c.query(`
    with base as (
      select
        upper(trim(j.next_operation)) operation_code,
        count(*)::int so_job,
        min(case
          when exists(
            select 1 from md_intermediate_bridge_operation bo
            join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
            where upper(trim(bo.operation_code))=upper(trim(j.next_operation))
          ) and not exists(
            select 1 from planning_job_operation po where po.job_num=j.job_num and po.is_active=true
          ) then '4I'
          when exists(
            select 1 from md_intermediate_bridge_operation bo
            join md_intermediate_bridge_segment bs on bs.id=bo.segment_id and bs.is_active=true
            where upper(trim(bo.operation_code))=upper(trim(j.next_operation))
          ) then '5I'
          when s.operation_code is null then '1'
          when s.operation_type='ST_SCOPE_ONLY' then '2'
          when m.id is null then '3'
          when not exists(
            select 1 from planning_job_operation po
            where po.job_num=j.job_num and po.is_active=true
          ) then '4'
          else '5'
        end) nhom
      from open_job_current j
      left join md_st_operation_scope s
        on upper(trim(s.operation_code))=upper(trim(j.next_operation))
       and s.is_active=true
      left join md_st_operation_mapping m
        on upper(trim(m.source_operation_code))=upper(trim(j.next_operation))
       and m.is_active=true
      where j.is_open=true
        and not exists(
          select 1 from planning_job_operation po
          where po.job_num=j.job_num and po.is_active=true
            and po.status in ('ELIGIBLE','PLANNED')
        )
      group by upper(trim(j.next_operation))
    )
    select
      b.operation_code,b.so_job,b.nhom,
      coalesce(
        (select standard_operation_rule from md_st_operation_mapping mm
         where upper(trim(mm.source_operation_code))=b.operation_code and mm.is_active=true
         order by mm.updated_at desc,mm.id desc limit 1),
        b.operation_code
      ) suggested_main,
      (select st_group from md_st_operation_mapping mm
       where upper(trim(mm.source_operation_code))=b.operation_code and mm.is_active=true
       order by mm.updated_at desc,mm.id desc limit 1) suggested_st_group,
      coalesce(
        (select mapping_rule from md_st_operation_mapping mm
         where upper(trim(mm.source_operation_code))=b.operation_code and mm.is_active=true
         order by mm.updated_at desc,mm.id desc limit 1),
        'DIRECT'
      ) suggested_rule
    from base b
    order by b.so_job desc,b.operation_code
    limit 300
  `);

  return (q.rows || []).map((r: any) => {
    const code = String(r.operation_code || "");
    let suggestedMain = String(r.suggested_main || code);
    let suggestedGroup: string | null = r.suggested_st_group ? String(r.suggested_st_group) : null;
    let suggestedRule = String(r.suggested_rule || "DIRECT");

    // Chưa có mapping trong DB → tìm trong bảng tĩnh (chỉ mục DIRECT).
    if (!suggestedGroup) {
      const s = ST_OPERATION_MAPPING.find((e) => e[0] === code && e[3] === "DIRECT");
      if (s) {
        suggestedMain = s[2];
        suggestedGroup = s[1];
        suggestedRule = "DIRECT";
      }
    }
    return {
      operation_code: code,
      so_job: Number(r.so_job || 0),
      nhom: String(r.nhom || "5"),
      suggested_main: suggestedMain || code,
      suggested_st_group: suggestedGroup,
      suggested_rule: suggestedRule,
    };
  });
}
