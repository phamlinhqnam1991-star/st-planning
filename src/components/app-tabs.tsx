import Link from "next/link";

export type AppTab="master"|"config"|"tracker"|"jobs"|"planning"|"schedule"|"import";

export function AppTabs({active}:{active:AppTab}){
 const tabs=[
  {key:"master",label:"Master Data",href:"/master-data"},
  {key:"config",label:"Cấu hình",href:"/settings"},
  {key:"tracker",label:"Part Tracker",href:"/part-tracker"},
  {key:"jobs",label:"All Open Jobs",href:"/all-open-jobs"},
  {key:"planning",label:"Planning Board",href:"/planning"},
  {key:"schedule",label:"Board Điều Độ",href:"/schedule"},
  {key:"import",label:"Import Master",href:"/import-master"},
 ] as const;
 return <nav className="erp-modules" aria-label="ST Planning modules">
  {tabs.map(t=><Link key={t.key} href={t.href} className={`erp-module ${active===t.key?"active":""}`}>{t.label}</Link>)}
 </nav>
}

export function SubTabs({items,active}:{items:{label:string;href:string;key:string}[];active?:string}){
 return <nav className="erp-subnav" aria-label="Section navigation">
  {items.map(x=><Link key={x.key} href={x.href} className={`erp-subnav-item ${active===x.key?"active":""}`}>{x.label}</Link>)}
 </nav>
}
