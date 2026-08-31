-- Rollback 060_process_requirement_lookup_indexes.sql
drop index if exists public.idx_md_process_requirement_active_code_value;
drop index if exists public.idx_md_process_requirement_active_code;
