export const ERP_DESIGN_TOKENS = {
  density: {
    compactRow: 36,
    comfortableRow: 44,
    toolbar: 44,
    header: 56,
    sidebar: 232,
  },
  radius: {
    control: 6,
    panel: 8,
    pill: 999,
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;

export type ErpDensity = "compact" | "comfortable";
