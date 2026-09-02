import Link from "next/link";

export type AppTab="master"|"config"|"tracker"|"jobtracker"|"jobs"|"planning"|"masking"|"schedule"|"import"|"guide";

export function AppTabs({active,presentation="erp"}:{active:AppTab;presentation?:"erp"|"legacy"}){
 const tabs=[
  {key:"master",label:"Master Data",short:"MD",href:"/master-data"},
  {key:"config",label:"Cấu hình",short:"CF",href:"/settings"},
  {key:"tracker",label:"Part Tracker",short:"PT",href:"/part-tracker"},
  {key:"jobtracker",label:"Job Tracker",short:"JT",href:"/job-tracker"},
  {key:"jobs",label:"All Open Jobs",short:"OJ",href:"/all-open-jobs"},
  {key:"planning",label:"Planning Board",short:"PL",href:"/planning"},
  {key:"masking",label:"Masking / Unmasking",short:"MU",href:"/masking-unmasking-planning"},
  {key:"schedule",label:"Board Điều Độ",short:"SC",href:"/schedule"},
  {key:"import",label:"Import Master",short:"IM",href:"/import-master"},
  {key:"guide",label:"Logic & Hướng dẫn",short:"LG",href:"/logic-guide"},
 ] as const;
 if(presentation==="legacy")return <nav className="erp-modules" aria-label="ST Planning modules">
  {tabs.map(t=><Link key={t.key} href={t.href} className={`erp-module ${active===t.key?"active":""}`} aria-current={active===t.key?"page":undefined}>{t.label}</Link>)}
 </nav>;
 return <nav className="erp-modules" aria-label="ST Planning modules">
  {tabs.map(t=><Link key={t.key} href={t.href} className={`erp-module ${active===t.key?"active":""}`} aria-current={active===t.key?"page":undefined}><span className="erp-module-short">{t.short}</span><span className="erp-module-label">{t.label}</span></Link>)}
 </nav>
}

export function SubTabs({items,active}:{items:{label:string;href:string;key:string}[];active?:string}){
 return <nav className="erp-subnav" aria-label="Section navigation">
  {items.map(x=><Link key={x.key} href={x.href} className={`erp-subnav-item ${active===x.key?"active":""}`} aria-current={active===x.key?"page":undefined}>{x.label}</Link>)}
 </nav>
}
