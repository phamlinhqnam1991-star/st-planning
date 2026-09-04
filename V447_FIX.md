# V447 — Production Execution sub-tabs + mixed report granularity

Scope only: Production Execution UI/API/data loader.

- Adds production sub-tabs: Chemical Line; Shot Peening (Auto + Manual); Masking & Unmasking; Painting; Sirius Cleaning; Blasting (Manual + Auto); Plating (Plating + He-Bake); Passivation / Brightening.
- Keeps All overview; Other is shown only for unmapped work so no production work disappears.
- Chemical Line + Painting: report WAITING / ON-GOING / DONE per scheduled row; no Job detail list is loaded/rendered.
- Remaining areas: keep V446 Job-level reporting and Shift.
- Server revalidates LINE mode against Chemical Line/Painting schedule resources.
- Adds distinct area header accents for quick identification.
- No SQL migration required. Existing V446 `production_execution_job` remains unchanged.
- Does not change Production Day, Planning Chain, READY/WAIT, Batch membership, Recipe, Schedule, Previous Main lock, Chemical Line proposal or capacity rules.
