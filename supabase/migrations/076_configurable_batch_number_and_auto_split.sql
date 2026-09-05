-- V460: configurable Batch numbering + Qty auto split per Main Operation.
begin;

alter table public.md_operation_master
  add column if not exists batch_sequence_start bigint not null default 1,
  add column if not exists batch_sequence_padding integer not null default 5,
  add column if not exists batch_size_qty numeric,
  add column if not exists batch_auto_split boolean not null default false;

alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_sequence_start_check;
alter table public.md_operation_master
  add constraint md_operation_master_batch_sequence_start_check
  check (batch_sequence_start >= 0);

alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_sequence_padding_check;
alter table public.md_operation_master
  add constraint md_operation_master_batch_sequence_padding_check
  check (batch_sequence_padding between 1 and 12);

alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_size_qty_check;
alter table public.md_operation_master
  add constraint md_operation_master_batch_size_qty_check
  check (batch_size_qty is null or batch_size_qty > 0);
alter table public.md_operation_master
  drop constraint if exists md_operation_master_batch_auto_split_size_check;
alter table public.md_operation_master
  add constraint md_operation_master_batch_auto_split_size_check
  check (not batch_auto_split or batch_size_qty is not null);

-- A Job Operation may be split across several Batch rows when Batch Size requires it.
-- Still prevent the same operation from being inserted twice into the SAME Batch.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='planning_batch_job' and c.contype='u'
      and pg_get_constraintdef(c.oid) ilike '%planning_job_operation_id%'
      and pg_get_constraintdef(c.oid) not ilike '%batch_id%'
  loop
    execute format('alter table public.planning_batch_job drop constraint %I',r.conname);
  end loop;
end $$;

create unique index if not exists ux_planning_batch_job_batch_operation
  on public.planning_batch_job(batch_id,planning_job_operation_id);

create index if not exists ix_planning_batch_job_operation_allocation
  on public.planning_batch_job(planning_job_operation_id,batch_id);

analyze public.md_operation_master;
analyze public.planning_batch_job;
commit;
