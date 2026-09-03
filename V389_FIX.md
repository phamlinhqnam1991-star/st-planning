# V389 — Right-click Job/Main Hold UI

- Removed the inline `H` / release button from Planning Matrix cells.
- Right-click READY/WAIT Main cell -> `Hold` -> existing Hold Reason/Note dialog.
- Right-click held Main cell -> `Unhold` directly.
- Held Jobs stay visible in Candidate Jobs; the held Main cell shows `HOLD`.
- Batch selection remains blocked for held occurrences and server-side Batch validation is unchanged.
- Recipe metadata dropdown no longer drops a Recipe merely because all currently eligible Jobs for it are held.
- No database migration is required beyond existing migration 071.
