# V454 — Remove standalone Masking / Unmasking Planning tab

- Removed the standalone `/masking-unmasking-planning` route from the app.
- Removed `Masking / Unmasking` from Operations navigation and ERP all-tabs demo.
- Kept `md_main_support_operation` configuration and the strict support resolver because Production Execution still consumes them.
- Production Execution keeps the V453 combined Job presentation: Unmasking steps first, then Masking steps, with independent execution status per support step.
- Updated Logic & Hướng dẫn to describe Masking/Unmasking as internal support logic for Production Execution rather than a standalone planning tab.
- READY/WAIT, Planning Chain, Batch, Recipe, Schedule and Auto Planning are unchanged.
