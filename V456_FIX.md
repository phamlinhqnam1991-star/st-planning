# V456 Fix — Remove stale Masking / Unmasking route before build

- The standalone `src/app/masking-unmasking-planning` workspace was removed in V454.
- Added that old route directory to `scripts/remove-stale-legacy.mjs`.
- This prevents overlay/extract-on-top deployments from keeping the deleted route and causing TypeScript errors during `next build`.
- Production Report Masking/Unmasking resolver, strict configuration, combined Job display, and Physical Area grouping are unchanged.
