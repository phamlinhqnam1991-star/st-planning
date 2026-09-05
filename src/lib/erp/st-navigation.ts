import type {ErpNavItem} from "@/components/erp/erp-shell";

export type StErpLeafKey=
 |"dashboard"
 |"master"
 |"config"
 |"tracker"
 |"jobtracker"
 |"jobs"
 |"planning"
 |"schedule"
 |"production"
 |"adjustment"
 |"productionalerts"
 |"import"
 |"guide";

export type StErpModuleKey="dashboard"|"operations"|"tracking"|"masterdata"|"administration";

export type StErpModuleGroup=ErpNavItem&{
 key:StErpModuleKey;
 items:Array<ErpNavItem&{key:StErpLeafKey}>;
};

/**
 * ERP navigation source of truth.
 * Level 1 = business module/work center.
 * Level 2 = function/workspace inside the selected module.
 */
export const ST_ERP_MODULE_GROUPS:StErpModuleGroup[]=[
 {
  key:"dashboard",label:"Dashboard",href:"/dashboard",shortLabel:"DB",
  items:[]
 },
 {
  key:"operations",label:"Vận hành",href:"/all-open-jobs",shortLabel:"OP",
  items:[
   {key:"jobs",label:"All Open Jobs",href:"/all-open-jobs",shortLabel:"OJ"},
   {key:"planning",label:"Planning Board",href:"/planning",shortLabel:"PL"},
   {key:"schedule",label:"Board Điều Độ",href:"/schedule",shortLabel:"SC"},
   {key:"production",label:"Production Execution",href:"/production-execution",shortLabel:"PX"},
   {key:"adjustment",label:"Điều chỉnh đầu ngày",href:"/daily-production-adjustment",shortLabel:"DA"},
   {key:"productionalerts",label:"Cảnh báo thay đổi SX",href:"/production-change-alerts",shortLabel:"PA"},
  ]
 },
 {
  key:"tracking",label:"Theo dõi",href:"/job-tracker",shortLabel:"TR",
  items:[
   {key:"jobtracker",label:"Job Tracker",href:"/job-tracker",shortLabel:"JT"},
   {key:"tracker",label:"Part Tracker",href:"/part-tracker",shortLabel:"PT"},
  ]
 },
 {
  key:"masterdata",label:"Master Data",href:"/master-data",shortLabel:"MD",
  items:[
   {key:"master",label:"Master Data",href:"/master-data",shortLabel:"MD"},
   {key:"import",label:"Import Master",href:"/import-master",shortLabel:"IM"},
  ]
 },
 {
  key:"administration",label:"Quản trị",href:"/settings",shortLabel:"AD",
  items:[
   {key:"config",label:"Cấu hình",href:"/settings",shortLabel:"CF"},
   {key:"guide",label:"Logic & Hướng dẫn",href:"/logic-guide",shortLabel:"LG"},
  ]
 },
];

/** Top-level modules consumed by the native ERP shell. */
export const ST_ERP_MODULES:ErpNavItem[]=ST_ERP_MODULE_GROUPS.map(({items:_items,...module})=>module);

const LEAF_TO_GROUP=Object.fromEntries(
 ST_ERP_MODULE_GROUPS.flatMap(group=>group.items.map(item=>[item.key,group.key]))
) as Partial<Record<StErpLeafKey,StErpModuleKey>>;

export function getStErpModuleKey(active:StErpLeafKey):StErpModuleKey{
 if(active==="dashboard")return "dashboard";
 return LEAF_TO_GROUP[active]||"operations";
}

export function getStErpModuleItems(groupKey:StErpModuleKey):ErpNavItem[]{
 return ST_ERP_MODULE_GROUPS.find(group=>group.key===groupKey)?.items||[];
}

export function getStErpModuleLabel(groupKey:StErpModuleKey):string{
 return ST_ERP_MODULE_GROUPS.find(group=>group.key===groupKey)?.label||groupKey;
}
