-- V529 - Operation Inbox review state
-- Stores only explicit operator review decisions that are outside ST.
-- ST membership itself remains canonical in md_st_operation_scope.

create table if not exists public.md_operation_review(
  operation_code text primary key,
  decision text not null,
  note text,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint md_operation_review_decision_check check(decision in ('NOT_ST'))
);

create index if not exists ix_md_operation_review_decision
  on public.md_operation_review(decision,operation_code);
