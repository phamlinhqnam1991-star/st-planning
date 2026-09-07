import type { ErpDensity } from "./design-tokens";

export const ERP_TABLE_PRESETS = {
  planning: {
    density: "compact" as ErpDensity,
    stickyHeader: true,
    striped: false,
  },
  masterData: {
    density: "compact" as ErpDensity,
    stickyHeader: true,
    striped: true,
  },
  tracker: {
    density: "comfortable" as ErpDensity,
    stickyHeader: true,
    striped: false,
  },
} as const;
