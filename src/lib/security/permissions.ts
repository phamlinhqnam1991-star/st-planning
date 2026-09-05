export const PERMISSIONS = [
  "dashboard.view",
  "jobs.view",
  "planning.view",
  "planning.edit",
  "schedule.view",
  "schedule.edit",
  "production.view",
  "production.report",
  "production.add_job",
  "adjustment.view",
  "adjustment.approve",
  "alerts.view",
  "chat.view",
  "chat.send",
  "tracking.view",
  "master.view",
  "master.edit",
  "import.view",
  "import.execute",
  "config.view",
  "config.edit",
  "security.manage",
  "guide.view",
  "training.view",
] as const;

export type PermissionKey = typeof PERMISSIONS[number];
export type ScopeType = "PLANNING_MAIN"|"SCHEDULE_AREA"|"PRODUCTION_AREA";

export const ALL_PERMISSION_SET = new Set<string>(PERMISSIONS);

export const ROLE_PRESETS: Record<string, PermissionKey[]> = {
  ADMIN: [...PERMISSIONS],
  PLANNER: [
    "dashboard.view","jobs.view","planning.view","planning.edit","schedule.view","schedule.edit",
    "production.view","adjustment.view","adjustment.approve","alerts.view","chat.view","chat.send","tracking.view",
    "guide.view","training.view",
  ],
  PRODUCTION_OPERATOR: [
    "dashboard.view","jobs.view","production.view","production.report","alerts.view","chat.view","chat.send","tracking.view",
    "guide.view","training.view",
  ],
  SHIFT_SUPERVISOR: [
    "dashboard.view","jobs.view","production.view","production.report","production.add_job","alerts.view","chat.view","chat.send",
    "tracking.view","guide.view","training.view",
  ],
};

export const PAGE_PERMISSION: Record<string, PermissionKey> = {
  dashboard:"dashboard.view",
  jobs:"jobs.view",
  planning:"planning.view",
  schedule:"schedule.view",
  production:"production.view",
  adjustment:"adjustment.view",
  productionalerts:"alerts.view",
  chat:"chat.view",
  tracker:"tracking.view",
  jobtracker:"tracking.view",
  master:"master.view",
  import:"import.view",
  config:"config.view",
  guide:"guide.view",
  training:"training.view",
  security:"security.manage",
};
