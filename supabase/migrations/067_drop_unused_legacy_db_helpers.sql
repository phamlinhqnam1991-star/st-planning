-- =====================================================================
-- 067_drop_unused_legacy_db_helpers.sql
-- Deep cleanup: remove PostgreSQL helpers that no current app/API/trigger calls.
--
-- Current canonical implementations:
-- - Production-day boundaries: src/lib/schedule-time.ts / schedule server logic.
-- - ST routing rebuild: src/lib/st-operation-flow.ts (syncAllStDerived), with
--   refresh_st_operation_mapping() still retained because current code calls it.
-- - Recipe/Batch suggestion: md_main_operation_recipe + live TypeScript recipe
--   resolver; the v266 migration already moved legacy Batch Key/Recipe Rules.
--
-- Historical migrations are intentionally left unchanged.
-- =====================================================================

begin;

-- Superseded by the current JS/TS production-day helpers.
drop function if exists public.production_day_start(date);
drop function if exists public.production_day_end(date);
drop function if exists public.get_production_day(timestamptz);

-- Superseded by syncAllStDerived() in the current ST Operation Flow.
drop function if exists public.rebuild_st_routing(uuid);

-- Superseded by the canonical md_main_operation_recipe live resolver.
drop function if exists public.suggest_recipe_and_batch_key(text,text);

commit;
