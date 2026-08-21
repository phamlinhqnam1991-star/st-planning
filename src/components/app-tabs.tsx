import Link from "next/link";

export type AppTab="master"|"config"|"tracker"|"import";

export function AppTabs({active}:{active:AppTab}){
 const tabs=[
  {key:"master",label:"Master Data",href:"/master-data"},
  {key:"config",label:"Cấu hình",href:"/settings"},
  {key:"tracker",label:"Part Tracker",href:"/part-tracker"},
  {key:"import",label:"Import Master",href:"/import-master"},
 ] as const;
 return <nav className="app-tabs" aria-label="ST Planning navigation">
  {tabs.map(t=><Link key={t.key} href={t.href} className={`app-tab ${active===t.key?"active":""}`}>{t.label}</Link>)}
 </nav>
}

export function SubTabs({items,active}:{items:{label:string;href:string;key:string}[];active?:string}){
 return <nav className="sub-tabs">{items.map(x=><Link key={x.key} href={x.href} className={`sub-tab ${active===x.key?"active":""}`}>{x.label}</Link>)}</nav>
}
