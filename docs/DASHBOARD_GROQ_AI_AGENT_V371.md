# Dashboard Groq AI Agent — V371

## Architecture

`Operational DB -> Deterministic Dashboard KPI -> Initial Snapshot -> Groq -> Read-only DB tools -> Evidence-backed analysis`

The Dashboard remains deterministic and usable without AI. Groq is a read-only decision-support layer.

## Why not dump the whole database into every prompt?

The agent has access to application data in `public` schema through safe tools, but reads only the records needed by the current question. This keeps context small, protects the Groq free quota, and produces more traceable answers.

## Tool set

- `database_catalog`
- `table_schema`
- `read_table`
- `aggregate_table`
- `get_job_context`
- `get_batch_context`
- `get_day_operations`
- `get_logic_reference`

## Traceability

Every answer returns an audit of the read-only tools/tables and row counts used as evidence. Conversation history is not treated as database evidence.

## Environment

```env
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_AI_MAX_TOOL_ROUNDS=4
```
