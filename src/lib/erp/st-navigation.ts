import type {ErpNavItem} from "@/components/erp/erp-shell";
import {PAGE_PERMISSION} from "@/lib/security/permissions";
import type {AccessContext} from "@/lib/security/access";

export type StErpLeafKey=
 |"dashboard"
 |"master"
 |"config"
 |"tracker"
 |"jobtracker"
 |"jobs"
 |"output"
 |"planning"
 |"schedule"
 |"production"
 |"adjustment"
 |"productionalerts"
 |"chat"
 |"import"
 |"guide"
 |"training"
 |"security";

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
  key:"operations",label:"Operations",href:"/all-open-jobs",shortLabel:"OP",
  items:[
   {key:"jobs",label:"All Open Jobs",href:"/all-open-jobs",shortLabel:"OJ"},
   {key:"output",label:"ST Output",href:"/st-output",shortLabel:"OUT"},
   {key:"planning",label:"Planning Board",href:"/planning",shortLabel:"PL"},
   {key:"schedule",label:"Scheduling Board",href:"/schedule",shortLabel:"SC"},
   {key:"production",label:"Production Execution",href:"/production-execution",shortLabel:"PX"},
   {key:"adjustment",label:"Daily Production Adjustment",href:"/daily-production-adjustment",shortLabel:"DA"},
   {key:"productionalerts",label:"Production Change Alerts",href:"/production-change-alerts",shortLabel:"PA"},
   {key:"chat",label:"Internal Chat",href:"/internal-chat",shortLabel:"CH"},
  ]
 },
 {
  key:"tracking",label:"Tracking",href:"/job-tracker",shortLabel:"TR",
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
  key:"administration",label:"Administration",href:"/settings",shortLabel:"AD",
  items:[
   {key:"config",label:"Configuration",href:"/settings",shortLabel:"CF"},
   {key:"guide",label:"Logic & Guide",href:"/logic-guide",shortLabel:"LG"},
   {key:"training",label:"New User Training",href:"/training",shortLabel:"TRN"},
   {key:"security",label:"Users & Permissions",href:"/users-permissions",shortLabel:"USR"},
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


export function getAuthorizedModuleGroups(ctx:AccessContext|null):StErpModuleGroup[]{
 if(!ctx?.active)return [];
 return ST_ERP_MODULE_GROUPS.map(group=>{
  if(group.key==="dashboard")return ctx.permissions.has("dashboard.view")?group:null;
  const items=group.items.filter(item=>{
   const permission=PAGE_PERMISSION[item.key];
   return permission?ctx.permissions.has(permission):false;
  });
  if(!items.length)return null;
  return {...group,href:items[0].href,items};
 }).filter(Boolean) as StErpModuleGroup[];
}
