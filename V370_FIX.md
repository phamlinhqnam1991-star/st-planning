# V370 — Dashboard Groq connection, data scope & conversation

- Added explicit Groq connection test and configured model availability status.
- Added visible AI Data Scope so users know exactly which dashboard fields/row limits Groq can read.
- Added compact execution work-item context to the AI snapshot.
- Added suggested questions grounded in the available snapshot.
- Added multi-turn Ask AI conversation history; current snapshot remains the factual source.
- Ask input now clears immediately after Enter / Ask.
- Fixed misleading `invalid analysis format`: a valid Groq text response now falls back to text and shows a format warning instead of a connection failure.
- No Planning / Batch / Schedule / Production Execution write logic changed.
