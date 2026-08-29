import type {PoolClient} from "pg";

/**
 * Các công đoạn TRUNG GIAN đang có Job (NextOperation không phải công đoạn chính):
 * - "Chưa có mapping" → mặc định là trung gian (Job neo vào công đoạn chính kế tiếp — v228).
 * - "Có mapping nhưng không nằm trong danh sách điều độ (md_planning_operation_scope)" → cũng là trung gian.
 * Kèm công đoạn chính KẾ TIẾP mà Job đang neo (từ dòng ELIGIBLE của planning chain).
 */

export type IntermediateOperation = {
  cong_doan: string;
  so_job: number;
  chua_neo: number;
  next_main: string | null;
  ly_do: string;
};

export async function intermediateOperations(c: PoolClient): Promise<IntermediateOperation[]> {
  const q = await c.query(`
    with j as (
      select j.job_num, upper(trim(j.next_operation)) cong_doan
      from open_job_current j
      where j.is_open = true
        and nullif(trim(coalesce(j.next_operation,'')),'') is not null
    ),
    mapped as (
      select distinct on (upper(trim(mm.source_operation_code)))
        upper(trim(mm.source_operation_code)) source,
        mm.standard_operation_rule main
      from md_st_operation_mapping mm
      where mm.is_active = true
      order by upper(trim(mm.source_operation_code)), mm.updated_at desc, mm.id desc
    ),
    scope_main as (
      select standard_operation from md_planning_operation_scope where is_active = true
    )
    select
      j.cong_doan,
      count(*)::int so_job,
      (count(*) filter (where po.standard_operation is null))::int chua_neo,
      (mode() within group (order by po.standard_operation)) next_main,
      case
        when m.source is null then '1. Chưa có mapping — mặc định là trung gian'
        when sm.standard_operation is null then '2. Có mapping nhưng không nằm trong danh sách điều độ'
        else '3. Công đoạn chính'
      end ly_do
    from j
    left join mapped m on m.source = j.cong_doan
    left join scope_main sm on sm.standard_operation = m.main
    left join lateral (
      select po.standard_operation
      from planning_job_operation po
      where po.job_num = j.job_num
        and po.is_active = true
        and po.status = 'ELIGIBLE'
      limit 1
    ) po on true
    where m.source is null or sm.standard_operation is null
    group by j.cong_doan, ly_do
    order by so_job desc, j.cong_doan
    limit 200
  `);
  return (q.rows || []) as IntermediateOperation[];
}
