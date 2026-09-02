# V372 — Groq Primary + OpenRouter Fallback

## Agreed provider architecture

`Dashboard Snapshot + ST Logic + Read-only DB Tools -> Groq primary -> OpenRouter fallback -> AI answer`

## Fallback behavior

- Groq remains the first provider.
- OpenRouter is attempted only when Groq is not configured for the request, times out, is rate-limited, or returns a provider/model HTTP failure.
- Once OpenRouter takes over a request, the remaining tool/finalization rounds stay on OpenRouter unless that provider also fails.
- Both providers share the exact same read-only database tools and ST Planning knowledge.
- No provider receives INSERT / UPDATE / DELETE / ALTER / DROP or arbitrary-SQL capability.

## Free fallback defaults

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=
OPENROUTER_APP_NAME=ST Planning
AI_MAX_TOOL_ROUNDS=4
```

`openrouter/free` is used as the default fallback model/router so the fallback can use OpenRouter free models that satisfy requested features such as tool calling / structured output when available.

## Dashboard UI

- Test Connection now checks Groq and OpenRouter separately.
- The active provider/model is shown in the AI header.
- An `OpenRouter fallback` badge appears when the current response actually used fallback.
- Chat messages show the provider that produced each answer.
- Dashboard deterministic KPI continue to work if both AI providers are unavailable.

## Unchanged

Planning Chain, READY/WAIT, Recipe resolution, Batch compatibility, Scheduling, Production Execution write logic and all operational source-of-truth rules are unchanged.
