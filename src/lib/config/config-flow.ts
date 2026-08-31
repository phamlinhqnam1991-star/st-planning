export type ConfigHealth = {
  scope_total: number;
  mapping_missing: number;
  mapping_total: number;
  master_total: number;
  group_total: number;
  area_total: number;
  area_group_total: number;
  schedule_total: number;
  schedule_op_total: number;
  planner_assigned: number;
  chain_ok: number;
  chain_planning_total: number;
  recipe_total: number;
  recipe_op_total: number;
  handling_total: number;
  time_total: number;
  colval_total: number;
  missing_jobs: number;
};

export type ConfigFlowItem = {
  key: string;
  label: string;
  href: string;
  no?: number;
  statusKey?: keyof ConfigHealth;
};

const n = (v: unknown) => Number(v || 0);

export function healthStatus(
  h: Partial<ConfigHealth>,
  key?: keyof ConfigHealth,
): "ok" | "warn" | "idle" {
  if (!key) return "idle";
  switch (key) {
    case "scope_total":
      return n(h.scope_total) > 0 ? "ok" : "warn";
    case "mapping_missing":
      return n(h.mapping_total) > 0 && n(h.mapping_missing) === 0 ? "ok" : "warn";
    case "master_total":
      return n(h.master_total) > 0 ? "ok" : "warn";
    case "group_total":
      return n(h.group_total) > 0 ? "ok" : "warn";
    case "area_total":
      return n(h.area_total) > 0 && n(h.area_group_total) > 0 ? "ok" : "warn";
    case "schedule_total":
      return n(h.schedule_total) > 0 && n(h.schedule_op_total) > 0 ? "ok" : "warn";
    case "planner_assigned":
      return n(h.schedule_total) > 0 && n(h.planner_assigned) > 0 ? "ok" : "warn";
    case "chain_ok":
      return n(h.chain_ok) > 0 ? "ok" : "warn";
    case "recipe_total":
      return n(h.recipe_total) > 0 ? "ok" : "warn";
    case "recipe_op_total":
      return n(h.recipe_op_total) > 0 ? "ok" : "warn";
    case "handling_total":
      return n(h.handling_total) > 0 ? "ok" : "warn";
    case "time_total":
      return n(h.time_total) > 0 ? "ok" : "warn";
    case "colval_total":
      return n(h.colval_total) > 0 ? "ok" : "warn";
    case "missing_jobs":
      return n(h.missing_jobs) > 0 ? "warn" : "ok";
    default:
      return "idle";
  }
}

export const CONFIG_FLOW: {
  tier: string;
  tag: string;
  hint?: string;
  items: ConfigFlowItem[];
}[] = [
  {
    tier: "Tầng 1 · Định nghĩa công đoạn",
    tag: "làm 1 lần",
    items: [
      { key: "overview", label: "🏠 Tổng quan Cấu hình", href: "/settings" },
      { key: "flow", label: "Trợ lý Operation (ST Operation Flow)", href: "/st-operation-flow", no: 1 },
      { key: "operationcodeorder", label: "ST Scope", href: "/operation-code-order", no: 2, statusKey: "scope_total" },
      { key: "operationmapping", label: "Source → Main Mapping", href: "/master/operationmapping", no: 3, statusKey: "mapping_missing" },
      { key: "operation", label: "Công đoạn chính (Main Operation)", href: "/master/operation", no: 4, statusKey: "master_total" },
      { key: "stgroup", label: "ST Group (nhóm công đoạn)", href: "/st-groups", no: 5, statusKey: "group_total" },
      { key: "area", label: "Khu vực vật lý", href: "/area", no: 6, statusKey: "area_total" },
      { key: "schedulearea", label: "Khu vực điều độ (lane)", href: "/schedule-areas", no: 7, statusKey: "schedule_total" },
      { key: "plannerassignment", label: "Phân chia Planner", href: "/planner-work-assignment", no: 8, statusKey: "planner_assigned" },
      { key: "chain", label: "Kết quả: Planning Chain", href: "/st-operation-flow", no: undefined, statusKey: "chain_ok" },
    ],
  },
  {
    tier: "Tầng 2 · Công thức & Rule",
    tag: "điều khiển tạo lô",
    hint: "Chỉ cần 9–11 cho nhu cầu cơ bản (chọn Job vào lô là ra Recipe đúng). 12 tùy chọn (từ điển cột).",
    items: [
      { key: "recipeoperationmap", label: "Công thức & Rule (Recipe · Công đoạn · Mã lô)", href: "/recipe-operation-map", no: 9, statusKey: "recipe_op_total" },
      { key: "recipetimeloading", label: "Thời gian Loading / Unloading", href: "/recipe-time-loading", no: 10, statusKey: "handling_total" },
      { key: "recipetimeprocess", label: "Thời gian xử lý (Process)", href: "/recipe-time-process", no: 11, statusKey: "time_total" },
      { key: "openjobcolumnvalues", label: "Cột All Open Job (từ điển)", href: "/open-job-column-values", no: 12, statusKey: "colval_total" },
    ],
  },
];
