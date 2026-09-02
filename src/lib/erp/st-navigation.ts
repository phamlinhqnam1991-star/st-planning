import type {ErpNavItem} from "@/components/erp/erp-shell";

export const ST_ERP_MODULES:ErpNavItem[]=[
 {key:"master",label:"Master Data",href:"/master-data",shortLabel:"MD"},
 {key:"config",label:"Cấu hình",href:"/settings",shortLabel:"CF"},
 {key:"tracker",label:"Part Tracker",href:"/part-tracker",shortLabel:"PT"},
 {key:"jobtracker",label:"Job Tracker",href:"/job-tracker",shortLabel:"JT"},
 {key:"jobs",label:"All Open Jobs",href:"/all-open-jobs",shortLabel:"OJ"},
 {key:"planning",label:"Planning Board",href:"/planning",shortLabel:"PL"},
 {key:"masking",label:"Masking / Unmasking",href:"/masking-unmasking-planning",shortLabel:"MU"},
 {key:"schedule",label:"Board Điều Độ",href:"/schedule",shortLabel:"SC"},
 {key:"import",label:"Import Master",href:"/import-master",shortLabel:"IM"},
 {key:"guide",label:"Logic & Hướng dẫn",href:"/logic-guide",shortLabel:"LG"},
];
