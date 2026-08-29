-- v235 Dọn cột "ma" trên Planning Board:
-- Cột ma trận Candidate Jobs đọc md_planning_operation_scope (công đoạn chính).
-- Main nào KHÔNG còn mapping từ source đang hoạt động (md_st_operation_scope is_active=true)
-- sẽ được tắt is_active=false → không còn hiển thị trên Board, khớp với panel
-- "Các công đoạn được hiển thị trên Planning Board".
-- (Khi bạn cấu hình lại source trỏ tới main đó, POST tự kích hoạt lại.)
begin;

-- 1) Planning Scope (cột ma trận Candidate Jobs + bộ lọc Operation)
with mapped_mains as (
  select distinct trim(upper(x)) main
  from md_st_operation_mapping m
  join md_st_operation_scope sc
    on upper(trim(sc.operation_code)) = upper(trim(m.source_operation_code))
   and sc.is_active = true
  cross join lateral unnest(string_to_array(m.standard_operation_rule, '/')) x
  where m.is_active = true and trim(x) <> ''
)
update md_planning_operation_scope ps
set is_active = false, updated_at = now()
where ps.is_active = true
  and not exists (
    select 1 from mapped_mains mm
    where exists (
      select 1 from unnest(string_to_array(ps.standard_operation, '/')) y
      where trim(upper(y)) = mm.main
    )
  );

-- 2) Schedule Area Operation Mapping (cùng điều kiện — dọn mapping điều độ của main đã mồ côi)
with mapped_mains as (
  select distinct trim(upper(x)) main
  from md_st_operation_mapping m
  join md_st_operation_scope sc
    on upper(trim(sc.operation_code)) = upper(trim(m.source_operation_code))
   and sc.is_active = true
  cross join lateral unnest(string_to_array(m.standard_operation_rule, '/')) x
  where m.is_active = true and trim(x) <> ''
)
update md_schedule_area_operation sa
set is_active = false, updated_at = now()
where sa.is_active = true
  and not exists (
    select 1 from mapped_mains mm
    where exists (
      select 1 from unnest(string_to_array(sa.standard_operation, '/')) y
      where trim(upper(y)) = mm.main
    )
  );

commit;

-- Kiểm tra nhanh: số main đang active còn lại (phải tương ứng với số cột trên Board)
select count(*) as main_dang_hien_thi
from md_planning_operation_scope
where is_active = true;
