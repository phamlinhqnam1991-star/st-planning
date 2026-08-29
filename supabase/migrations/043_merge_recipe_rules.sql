-- =====================================================================
-- 043_merge_recipe_rules.sql
-- ST Planning - v266: GỘP "Batch Key / Recipe Rules" vào "Operation → Recipe".
--
-- 1) Thêm 2 cột Mã lô mẫu (batch_key_template) + Prefix số lô (batch_no_prefix)
--    vào md_main_operation_recipe (trước đây chỉ có ở bảng rule).
-- 2) TỰ ĐỘNG chuyển Rule cũ (đang hoạt động, match ALL) sang mapping:
--    - điều kiện của rule -> selection_rule (cùng định dạng JSON);
--    - suggested_recipe_key -> recipe_key;
--    - priority, batch_key_template, batch_no_prefix giữ nguyên;
--    - áp dụng cho từng Operation Code thuộc công đoạn chính của rule
--      (qua md_st_operation_mapping + md_st_operation_scope).
-- Bảng md_batch_key_recipe_rule / _condition GIỮ NGUYÊN (không xóa dữ liệu)
-- nhưng không còn được app sử dụng.
-- Chạy 1 lần trên Supabase SQL Editor TRƯỚC khi deploy code v266.
-- =====================================================================

begin;

alter table public.md_main_operation_recipe
    add column if not exists batch_key_template text;

alter table public.md_main_operation_recipe
    add column if not exists batch_no_prefix text;

-- Chuyển rule cũ sang mapping (chỉ rule ACTIVE + match_mode ALL + có recipe).
insert into public.md_main_operation_recipe(
    operation_code, standard_operation, recipe_key, priority, is_default,
    selection_rule, batch_key_template, batch_no_prefix, note, is_active, updated_at
)
select
    m.source_operation_code,
    r.standard_operation,
    r.suggested_recipe_key,
    coalesce(r.priority, 100),
    false,
    case
        when count(c.id) = 0 then null
        else jsonb_agg(
            jsonb_build_object(
                'source_column', c.source_column,
                'operator', c.operator,
                'source_value', c.source_value
            )
            order by c.id
        )::text
    end,
    r.batch_key_template,
    r.batch_no_prefix,
    'Chuyển từ Batch Key / Recipe Rules (v266)',
    true,
    now()
from public.md_batch_key_recipe_rule r
join public.md_st_operation_mapping m
  on m.standard_operation_rule = r.standard_operation
 and m.is_active = true
join public.md_st_operation_scope s
  on upper(trim(s.operation_code)) = upper(trim(m.source_operation_code))
 and s.is_active = true
 and s.operation_type = 'PLANNING_OPERATION'
left join public.md_batch_key_recipe_rule_condition c
  on c.rule_id = r.id
 and c.is_active = true
where r.is_active = true
  and r.suggested_recipe_key is not null
  and coalesce(upper(r.match_mode), 'ALL') = 'ALL'
group by
    m.source_operation_code, r.standard_operation, r.suggested_recipe_key,
    r.priority, r.batch_key_template, r.batch_no_prefix
on conflict (operation_code, recipe_key)
do update set
    batch_key_template = coalesce(md_main_operation_recipe.batch_key_template, excluded.batch_key_template),
    batch_no_prefix    = coalesce(md_main_operation_recipe.batch_no_prefix, excluded.batch_no_prefix),
    selection_rule     = coalesce(md_main_operation_recipe.selection_rule, excluded.selection_rule),
    note               = coalesce(md_main_operation_recipe.note, excluded.note),
    updated_at         = now();

commit;
