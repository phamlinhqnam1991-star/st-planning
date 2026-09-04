# V452 FIX — Strict Masking / Unmasking by Main

Fixed Masking & Unmasking Planning configuration behavior.

- Once a Main Operation has any explicit support configuration, the resolver no longer falls back independently by support type.
- Example: `V_A-SHPN -> Masking = MSKG-SP`, Unmasking empty => Masking appears, Unmasking does not appear.
- If only Unmasking is configured, Masking does not appear.
- Routing-derived fallback remains only for Main Operations with no explicit support configuration at all.
- `__NONE__` never matches a routing support row.
- READY / Batch / Schedule / Auto Planning are unchanged.
