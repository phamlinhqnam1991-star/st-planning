# Dashboard + Groq AI — V368

## Scope

Adds an Operations Dashboard without changing Planning / Batch / Scheduling business logic.

Dashboard data is calculated deterministically from current application data:

- Open Jobs / Current Good WIP / Open Surface
- Planning Chain READY workload
- Unscheduled Batch backlog
- Scheduled Batch count and resource hours
- Production Execution WAITING / ON-GOING / DONE
- delayed work and schedule overlap risks
- Area execution / bottleneck view
- Resource workload
- 7-day schedule vs DONE trend

## AI architecture

`Operational Data -> Dashboard KPI Engine -> Structured Snapshot -> Groq -> Insight`

Groq is read-only. It can analyze, explain and recommend but it cannot mutate:

- Planning Chain READY / WAIT
- Batch / Recipe
- Schedule / Resource / Planned Time
- Production Execution status

The Dashboard remains usable if Groq is unavailable.

## Vercel environment

Set these server-side variables:

```env
GROQ_API_KEY=your_key
GROQ_MODEL=openai/gpt-oss-20b
GROQ_BASE_URL=https://api.groq.com/openai/v1
```

Only `GROQ_API_KEY` is required. The model/base URL have defaults.

## User flow

1. Open **Operations -> Dashboard**.
2. Select a production date.
3. Deterministic KPI load first.
4. Groq automatically analyzes the current date snapshot.
5. Use **Refresh AI** after operational data changes.
6. Use **Ask AI** to ask questions about the same Dashboard snapshot.
