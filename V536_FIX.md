# V536 - Planning Board Job filter Excel multi-paste

## Scope
Only Planning Board column-filter UI/client behavior was changed. Planning, Batch, Recipe, Planning Chain and Scheduling logic are unchanged.

## Change
- Job column filter accepts a multi-value clipboard paste from Excel.
- Supported separators: newline, tab, comma, semicolon.
- Trims values, removes surrounding quotes, de-duplicates case-insensitively and preserves Job strings such as leading zeroes / `-R` suffixes.
- Exact-match lookup is performed against the full Job option set for all loaded Candidates, not only visible/scroll/search rows.
- Multi-paste replaces the current Job filter selection, then auto-selects all matched Jobs.
- Popup reports input / matched / not-found counts and shows not-found Job values.
- Single-value paste remains normal search behavior.
