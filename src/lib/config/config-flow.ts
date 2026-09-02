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
    tier: "01 · Operation Architecture",
    tag: "nền tảng",
    hint: "Xác định Operation nào thuộc ST, map Source → Main và thứ tự Planning.",
    items: [
      { key: "flow", label: "ST Operation Flow", href: "/st-operation-flow", no: 1, statusKey: "chain_ok" },
      { key: "operationcodeorder", label: "ST Scope & Operation Code", href: "/operation-code-order", no: 2, statusKey: "scope_total" },
      { key: "operationmapping", label: "Source → Main Mapping", href: "/master/operationmapping", no: 3, statusKey: "mapping_missing" },
      { key: "operation", label: "Main Operation", href: "/master/operation", no: 4, statusKey: "master_total" },
    ],
  },
  {
    tier: "02 · Organization & Resource",
    tag: "ownership",
    hint: "Gắn Main Operation vào nhóm, khu vực vật lý, lane điều độ và Planner phụ trách.",
    items: [
      { key: "stgroup", label: "ST Group", href: "/st-groups", no: 5, statusKey: "group_total" },
      { key: "area", label: "Physical Area", href: "/area", no: 6, statusKey: "area_total" },
      { key: "schedulearea", label: "Schedule Area", href: "/schedule-areas", no: 7, statusKey: "schedule_total" },
      { key: "plannerassignment", label: "Planner Assignment", href: "/planner-work-assignment", no: 8, statusKey: "planner_assigned" },
    ],
  },
  {
    tier: "03 · Recipe & Batch",
    tag: "batch rules",
    hint: "Cấu hình Recipe proposal, Batch Key, điều kiện tương thích và nguồn giá trị từ All Open Job.",
    items: [
      { key: "recipeoperationmap", label: "Recipe & Batch Rules", href: "/recipe-operation-map", no: 9, statusKey: "recipe_op_total" },
      { key: "processrequirementfilter", label: "Process Requirement Import Filter", href: "/process-requirement-filter", no: 10 },
      { key: "openjobcolumnvalues", label: "Open Job Column Values", href: "/open-job-column-values", no: 11, statusKey: "colval_total" },
    ],
  },
  {
    tier: "04 · Time & Scheduling",
    tag: "duration",
    hint: "Định nghĩa thời gian chuẩn dùng khi tạo Batch và điều độ.",
    items: [
      { key: "recipetimeloading", label: "Loading / Unloading Time", href: "/recipe-time-loading", no: 12, statusKey: "handling_total" },
      { key: "recipetimeprocess", label: "Process Time", href: "/recipe-time-process", no: 13, statusKey: "time_total" },
    ],
  },
  {
    tier: "05 · Automation",
    tag: "future ready",
    hint: "Quy tắc Auto Planning dùng chung data model với Planning thủ công.",
    items: [
      { key: "autoplanning", label: "Auto Planning Rules", href: "/auto-planning-rules", no: 14 },
    ],
  },
];
