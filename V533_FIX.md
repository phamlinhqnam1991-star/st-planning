# V533 — ST Operation Flow runtime/schema compatibility fix

## Scope
Only hardens `/st-operation-flow` against runtime/schema mismatches. No ST Output, Planning Chain, Candidate, Batch or Scheduling business logic is changed.

## Changes
- ST Operation Flow page no longer performs a write/backfill during Server Component render.
- Each data source is loaded independently with safe fallback queries.
- Legacy/missing `md_operation_master.batch_prefix` no longer crashes the page; UI receives `null` in compatibility mode.
- Legacy Bridge schema without `priority`/`note` or route sample data falls back safely.
- Missing optional Config sources no longer produce a full-page 500.
- Technical schema warnings are shown inside the ERP page so the failing table/column can be identified immediately.
- Fatal DB connection/core failures render an ERP error panel instead of Vercel's blank `This page couldn't load` screen.
- API GET no longer requires `batch_prefix` to exist.

## Unchanged
- ST Final Steps / ST Output V527 logic.
- Operation Inbox V529/V532 logic.
- Source → Main Mapping rules.
- Planning Chain sync semantics.
- Batch/Scheduling logic.
