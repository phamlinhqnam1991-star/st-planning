-- =====================================================================
-- 039_open_job_column_values_all_columns.sql
-- v189 - Open Job Column Values lấy TẤT CẢ cột của All Open Job (140+ cột).
--
-- Trước đây hàm chỉ quét ~25 cột chuẩn hoá của open_job_current, bỏ sót
-- phần lớn cột nguồn (chúng vẫn nằm đầy đủ trong source_data JSONB).
-- Hàm mới:
--   1) Deactivate toàn bộ giá trị cũ;
--   2) Quét MỌI key trong source_data của mọi Job (một câu lệnh duy nhất);
--   3) Bổ sung giá trị từ các cột chuẩn hoá;
--   4) Trả về thống kê cho mọi cột (key source_data + cột chuẩn hoá).
-- =====================================================================

begin;

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

commit;
