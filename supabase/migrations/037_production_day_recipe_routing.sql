-- =====================================================================
-- 037_production_day_recipe_routing.sql
-- v187 - Unified Recipe System for ALL Main Operations
--
-- Key Changes:
-- 1. Mở rộng Recipe System cho tất cả Main Operations (không chỉ Chemical/Paint)
-- 2. Batch Key có thể dựa trên các cột All Open Job
-- 3. Production day chuẩn: 06:00 → 06:00 hôm sau
-- 4. Chemical Line timeline: Loading → Process → NDT → Unloading
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Open Job Column Values Master
-- Scan tất cả giá trị unique theo từng cột trong All Open Job
-- ---------------------------------------------------------------------

create table if not exists public.md_open_job_column_value (
    id bigserial primary key,
    source_column text not null,
    source_value text not null,
    display_name text,
    seen_count integer not null default 0,
    last_seen_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(source_column, source_value)
);

create index if not exists ix_open_job_column_value_column
    on public.md_open_job_column_value(source_column, is_active);

create index if not exists ix_open_job_column_value_value
    on public.md_open_job_column_value(source_value);

create index if not exists ix_open_job_column_value_seen
    on public.md_open_job_column_value(last_seen_at desc)
    where is_active;

alter table public.md_open_job_column_value enable row level security;

drop policy if exists "authenticated read open job column value"
    on public.md_open_job_column_value;

create policy "authenticated read open job column value"
    on public.md_open_job_column_value
    for select to authenticated
    using (true);

comment on table public.md_open_job_column_value is
'Unique values extracted from All Open Job columns. Used for Batch Key / Recipe Rules configuration.';

-- ---------------------------------------------------------------------
-- 2. Batch Key / Recipe Rules Master
-- Flexible rule-based recipe and batch key determination
-- ---------------------------------------------------------------------

create table if not exists public.md_batch_key_recipe_rule (
    id bigserial primary key,
    
    rule_name text not null,
    standard_operation text not null,
    
    match_mode text not null default 'ALL'
        check(match_mode in ('ALL','ANY')),
    
    priority integer not null default 100,
    
    suggested_recipe_key text,
    batch_key_template text,
    batch_no_prefix text,
    
    is_active boolean not null default true,
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.md_batch_key_recipe_rule_condition (
    id bigserial primary key,
    rule_id bigint not null
        references public.md_batch_key_recipe_rule(id) on delete cascade,
    
    source_column text not null,
    operator text not null
        check(operator in ('equals','contains','not_empty','starts_with','ends_with')),
    
    source_value text,
    
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists ix_batch_key_recipe_rule_operation
    on public.md_batch_key_recipe_rule(standard_operation, is_active, priority);

create index if not exists ix_batch_key_recipe_rule_condition_rule
    on public.md_batch_key_recipe_rule_condition(rule_id, is_active);

alter table public.md_batch_key_recipe_rule enable row level security;
alter table public.md_batch_key_recipe_rule_condition enable row level security;

drop policy if exists "authenticated read batch key recipe rule"
    on public.md_batch_key_recipe_rule;

create policy "authenticated read batch key recipe rule"
    on public.md_batch_key_recipe_rule
    for select to authenticated
    using (true);

drop policy if exists "authenticated read batch key recipe rule condition"
    on public.md_batch_key_recipe_rule_condition;

create policy "authenticated read batch key recipe rule condition"
    on public.md_batch_key_recipe_rule_condition
    for select to authenticated
    using (true);

comment on table public.md_batch_key_recipe_rule is
'Flexible rules to determine Recipe and Batch Key from All Open Job column values. Applies to ALL Main Operations.';

comment on table public.md_batch_key_recipe_rule_condition is
'Conditions for each rule. One rule can have multiple conditions with ALL/ANY matching mode.';

-- ---------------------------------------------------------------------
-- 3. Recipe Mapping cho tất cả Main Operations
-- Mở rộng md_operation_code_recipe thành generic operation mapping
-- ---------------------------------------------------------------------

-- Đổi tên bảng để reflect purpose mới (cho tất cả operations)
alter table if exists public.md_operation_code_recipe
    rename to md_main_operation_recipe;

-- Thêm standard_operation để hỗ trợ generic mapping
alter table public.md_main_operation_recipe
    add column if not exists standard_operation text;

-- Backfill standard_operation từ chemical line operation codes
update public.md_main_operation_recipe
set standard_operation = case 
    when operation_code in ('CMSA','CHEMMILL','CPBILP','CPBILP-A','BSAUNSLD','TSAUNSLD','BSASLD','TSASLD','CCNV-IM','CCNV-IA','ANOD/CCNV FB','V_PASS/BRTG','FMSKG-CM','SIPC','SI-SEAL','STRIP','A-DBLST','M-DBLST','PLA-ZiNi','PLA-CC')
    then 'CHEMICAL_LINE'
    else null
end
where standard_operation is null;

-- Update comment
comment on table public.md_main_operation_recipe is
'Generic Main Operation → Recipe mapping. Originally for Chemical Line, now extended to ALL Main Operations.';

-- ---------------------------------------------------------------------
-- 4. Process Time Rules cho tất cả Main Operations
-- Mở rộng để support tất cả operations
-- ---------------------------------------------------------------------

-- Table đã có, chỉ cần update comment
comment on table public.md_recipe_time_rule is
'Process time rules for ALL Main Operations. Not limited to Chemical Line and Paint.';

-- ---------------------------------------------------------------------
-- 5. Production Day definition
-- Thêm function để xác định production day boundaries
-- ---------------------------------------------------------------------

create or replace function public.production_day_start(p_date date)
returns timestamptz
language sql
stable
as $$
    select (p_date + interval '6 hours')::timestamptz;
$$;

create or replace function public.production_day_end(p_date date)
returns timestamptz
language sql
stable
as $$
    select (p_date + interval '1 day + 6 hours')::timestamptz;
$$;

create or replace function public.get_production_day(p_timestamp timestamptz)
returns date
language sql
stable
as $$
    select (p_timestamp - interval '6 hours')::date;
$$;

comment on function public.production_day_start is
'Production day starts at 06:00 for the given date.';

comment on function public.production_day_end is
'Production day ends at 06:00 next day.';

comment on function public.get_production_day is
'Convert timestamp to production day (06:00-06:00 boundary).';

-- ---------------------------------------------------------------------
-- 6. Update md_process_recipe để support mapping cho tất cả operations
-- ---------------------------------------------------------------------

-- Thêm index để improve lookup performance
create index if not exists ix_process_recipe_family_group_operation
    on public.md_process_recipe(process_family, recipe_group, is_active, recipe_no);

-- ---------------------------------------------------------------------
-- 7. Update planning_schedule để support timeline mở rộng
-- Timeline không bị giới hạn bởi production day boundary
-- ---------------------------------------------------------------------

-- Timeline column đã có trong migration 036
-- Chỉ cần update comment để reflect timeline behavior
comment on column public.planning_schedule.planned_start is
'Resource occupation start. For Chemical Line this equals Loading Start. Timeline extends beyond production day if needed.';

comment on column public.planning_schedule.planned_end is
'Resource occupation end. For Chemical Line this equals Unloading End. Timeline extends beyond production day if needed.';

-- ---------------------------------------------------------------------
-- 8. Function để rebuild Open Job Column Values
-- Scan tất cả columns trong open_job_current và extract unique values
-- ---------------------------------------------------------------------

create or replace function public.rebuild_open_job_column_values()
returns table(source_column text, total_values bigint, active_values bigint)
language plpgsql
security definer
as $rebuild$
declare
    real_columns text[];
    all_columns text[];
    col_name text;
    total_count bigint;
    active_count bigint;
begin
    -- 1) Deactivate tất cả giá trị cũ trước (chờ reactivate ở các bước sau)
    update public.md_open_job_column_value
    set is_active = false,
        updated_at = now();

    -- 2) Quét TẤT CẢ cột trong source_data JSONB của mọi Job
    --    source_data giữ nguyên 140+ cột của file All Open Job.
    insert into public.md_open_job_column_value(source_column, source_value, display_name, seen_count, last_seen_at, is_active)
    select
        kv.key,
        kv.value,
        kv.value,
        count(*),
        max(v.last_seen_at),
        true
    from open_job_current v
    cross join jsonb_each_text(coalesce(v.source_data, '{}'::jsonb)) kv
    where kv.value is not null
      and trim(kv.value) <> ''
    group by kv.key, kv.value
    on conflict on constraint md_open_job_column_value_source_column_source_value_key
    do update set
        display_name = excluded.display_name,
        seen_count = excluded.seen_count,
        last_seen_at = excluded.last_seen_at,
        is_active = true,
        updated_at = now();

    -- 3) Cột chuẩn hoá: lấy thêm giá trị từ cột thật của open_job_current
    select array_agg(column_name::text)
    into real_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'open_job_current'
      and column_name not in ('job_num','is_open','last_import_status','first_seen_at','last_seen_at','last_changed_at','closed_at','last_import_batch_id','updated_at','source_hash','source_data');

    foreach col_name in array real_columns loop
        execute format($$
            insert into public.md_open_job_column_value(source_column, source_value, display_name, seen_count, last_seen_at, is_active)
            select
                %L,
                %I,
                %I,
                count(*),
                max(last_seen_at),
                true
            from open_job_current
            where %I is not null
              and trim(%I::text) <> ''
            group by %I
            on conflict on constraint md_open_job_column_value_source_column_source_value_key
            do update set
                display_name = excluded.display_name,
                seen_count = excluded.seen_count,
                last_seen_at = excluded.last_seen_at,
                is_active = true,
                updated_at = now()
        $$, col_name, col_name, col_name, col_name, col_name, col_name);
    end loop;

    -- 4) Thống kê cho MỌI cột: key source_data + cột chuẩn hoá
    select array_agg(k)
    into all_columns
    from (
        select distinct key::text as k
        from open_job_current
        cross join jsonb_each_text(coalesce(source_data, '{}'::jsonb))
        where key is not null
        union
        select column_name::text
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'open_job_current'
          and column_name not in ('job_num','is_open','last_import_status','first_seen_at','last_seen_at','last_changed_at','closed_at','last_import_batch_id','updated_at','source_hash','source_data')
    ) cols
    where k is not null;

    foreach col_name in array all_columns loop
        select count(*), count(*) filter(where v.is_active)
        into total_count, active_count
        from public.md_open_job_column_value v
        where v.source_column = col_name;

        return query select col_name, total_count, active_count;
    end loop;

    -- 5) Dọn giá trị inactive lâu ngày
    delete from public.md_open_job_column_value
    where is_active = false
      and updated_at < now() - interval '7 days';

    return;
end;
$rebuild$;

-- ---------------------------------------------------------------------
-- 9. Function để apply Batch Key / Recipe Rules
-- Dùng trong Planning Board để đề xuất recipe
-- ---------------------------------------------------------------------

create or replace function public.suggest_recipe_and_batch_key(
    p_standard_operation text,
    p_job_num text
)
returns table(
    suggested_recipe_key text,
    suggested_recipe_name text,
    batch_key text,
    batch_no_prefix text,
    rule_id bigint,
    rule_name text
)
language plpgsql
security definer
as $$
declare
    v_source_data jsonb;
    v_match_found boolean;
begin
    -- Get source data for the job
    select source_data into v_source_data
    from open_job_current
    where job_num = p_job_num;
    
    if v_source_data is null then
        return;
    end if;
    
    -- Try to find matching rule
    return query
    with ranked_rules as (
        select 
            r.id,
            r.rule_name,
            r.match_mode,
            r.suggested_recipe_key,
            r.batch_key_template,
            r.batch_no_prefix,
            r.priority,
            -- Count how many conditions match
            count(
                case 
                    when c.source_column is not null then
                        case c.operator
                            when 'equals' then
                                case when v_source_data->>c.source_column = c.source_value then 1 else 0 end
                            when 'contains' then
                                case when v_source_data->>c.source_column ilike '%'||c.source_value||'%' then 1 else 0 end
                            when 'not_empty' then
                                case when v_source_data->>c.source_column is not null and trim((v_source_data->>c.source_column)::text) <> '' then 1 else 0 end
                            when 'starts_with' then
                                case when v_source_data->>c.source_column ilike c.source_value||'%' then 1 else 0 end
                            when 'ends_with' then
                                case when v_source_data->>c.source_column ilike '%'||c.source_value then 1 else 0 end
                            else 0
                        end
                    else 0
                end
            ) as matched_conditions,
            count(*) as total_conditions
        from public.md_batch_key_recipe_rule r
        left join public.md_batch_key_recipe_rule_condition c
            on c.rule_id = r.id
            and c.is_active = true
        where r.standard_operation = p_standard_operation
          and r.is_active = true
        group by r.id, r.rule_name, r.suggested_recipe_key, r.batch_key_template, r.batch_no_prefix, r.priority
    ),
    evaluated_rules as (
        select 
            *,
            case 
                when match_mode = 'ALL' and matched_conditions = total_conditions then true
                when match_mode = 'ANY' and matched_conditions > 0 then true
                else false
            end as rule_matches
        from ranked_rules
    )
    select 
        r.suggested_recipe_key,
        pr.recipe_name as suggested_recipe_name,
        r.batch_key_template,
        r.batch_no_prefix,
        r.id as rule_id,
        r.rule_name
    from evaluated_rules r
    left join public.md_process_recipe pr
        on pr.recipe_key = r.suggested_recipe_key
        and pr.is_active = true
    where r.rule_matches = true
    order by r.priority asc, r.id asc
    limit 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Initial data seeding cho rules
-- ---------------------------------------------------------------------

-- Seed một số rules mẫu cho chemical line và paint
-- User có thể thêm/sửa sau này
insert into public.md_batch_key_recipe_rule(rule_name, standard_operation, match_mode, suggested_recipe_key, batch_key_template, batch_no_prefix, priority, is_active)
values
    ('Chemical Line BSA Unsealed default', 'CHEMICAL_LINE', 'ALL', 'CHEMICAL_LINE|CHEMICAL_LINE|002', 'CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA UNSEALED', 'CHM', 100, true),
    ('Chemical Line BSA Sealed default', 'CHEMICAL_LINE', 'ALL', 'CHEMICAL_LINE|CHEMICAL_LINE|003', 'CHEMICAL_LINE|CHEMICAL_LINE|ANODIZING BSA SEALED', 'CHM', 101, true),
    ('Paint PRIMER default', 'PRIMER', 'ALL', null, null, 'PRI', 100, true),
    ('Paint TOPCOAT1 default', 'TOPCOAT1', 'ALL', null, null, 'TOP', 100, true)
on conflict do nothing;

analyze public.md_open_job_column_value;
analyze public.md_batch_key_recipe_rule;
analyze public.md_batch_key_recipe_rule_condition;

commit;

-- Verification
select 'Migration 037 completed successfully' as status;