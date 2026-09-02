# Dashboard AI Provider Fallback — V372

Provider order:

`Groq -> OpenRouter`

Groq uses `GROQ_API_KEY / GROQ_MODEL / GROQ_BASE_URL`.
OpenRouter uses `OPENROUTER_API_KEY / OPENROUTER_MODEL / OPENROUTER_BASE_URL` and defaults to `openrouter/free`.

The provider router is server-side. Both providers receive the same versioned ST Planning knowledge and the same safe read-only database tool definitions. Fallback changes only the inference provider; it does not change business logic or database access boundaries.

The connection endpoint reports both provider states. A normal AI response reports the actual provider/model used plus whether OpenRouter fallback was activated.
