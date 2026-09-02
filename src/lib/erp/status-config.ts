export type ErpStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple";

export type ErpStatusKey =
  | "READY"
  | "WAIT"
  | "HOLD"
  | "UNSCHEDULED"
  | "SCHEDULED"
  | "RUNNING"
  | "DONE"
  | "ERROR"
  | "ACTIVE"
  | "INACTIVE";

export const ERP_STATUS_CONFIG: Record<ErpStatusKey, { label: string; tone: ErpStatusTone }> = {
  READY: { label: "READY", tone: "info" },
  WAIT: { label: "WAIT", tone: "warning" },
  HOLD: { label: "HOLD", tone: "danger" },
  UNSCHEDULED: { label: "Chưa điều độ", tone: "neutral" },
  SCHEDULED: { label: "Đã điều độ", tone: "purple" },
  RUNNING: { label: "Đang chạy", tone: "info" },
  DONE: { label: "Hoàn tất", tone: "success" },
  ERROR: { label: "Lỗi", tone: "danger" },
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};
