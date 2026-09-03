# V413 FIX — Dashboard combo chart fixed Surface axis

- `Surface + Qty by Main Planning / Immediate Operation`: left Surface axis is now fixed at **50,000 dm²**.
- Right Qty axis remains fixed at **10,000 pcs**.
- Surface bars are visually capped at 50,000 dm² so values above the axis maximum do not render outside the plot; the data label and tooltip still show the real Surface value.
- Removed the former dynamic `niceAxisMax` helper because it is no longer used.
- No change to Dashboard population/resolver, Planning Board Workload Summary, Planning Chain, Batch, Recipe, Schedule, READY/WAIT/HOLD, or database schema.
