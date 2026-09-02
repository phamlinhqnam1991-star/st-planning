# V371 — Groq Read-Only Database Agent

## Agreed architecture update

Dashboard AI is upgraded from snapshot-only analysis to:

`Dashboard Snapshot + ST Logic Knowledge + Read-only Database Tools -> Groq AI Agent -> Evidence-backed answer`

## New read-only capabilities

- Discover application tables/views in PostgreSQL `public` schema.
- Inspect table columns / PK / FK.
- Safely read filtered rows from any public application table/view.
- Safely aggregate count/sum/avg/min/max.
- Read full Job context: Open Job + Planning Chain + Batch/Schedule/Execution history + Routing + Recipe context.
- Read full Batch context: Batch + Jobs + current job data + Schedule/Resource + Recipe + Execution.
- Read scheduled operations for a production day / Area / Resource.
- Read canonical ST Planning logic reference.

## Safety boundary

- No arbitrary SQL generated/executed by Groq.
- No INSERT / UPDATE / DELETE / ALTER / DROP tools.
- No Planning / Batch / Schedule / Recipe / Execution/config mutation.
- Generic row reads are bounded to 50 rows per tool call; day context is bounded to 100.
- Tool rounds default to 4 and can be limited with `GROQ_AI_MAX_TOOL_ROUNDS` to protect free Groq quota.

## Evidence visibility

Each Ask AI response reports:

- tool(s) used;
- tables inspected;
- number of rows inspected.

If no database tool is needed, the UI explicitly shows that the answer used the Dashboard snapshot only.

## Business logic knowledge

V371 supplies versioned canonical knowledge for:

- ST Scope / Main Planning flow;
- RAW NextOperation -> Mapping -> Main Operation -> Main Planning Order;
- Planning Chain READY/WAIT/PLANNED;
- Recipe / Batch compatibility;
- Paint occurrences;
- Batch vs Scheduling;
- Chemical Line / Painting;
- Masking / Unmasking;
- Production Execution;
- AI read-only boundary.

No existing Planning/Batch/Schedule/Production write flow is changed.
