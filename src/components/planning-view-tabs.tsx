import Link from "next/link";

type PlanningView="candidates"|"batches";

export function PlanningViewTabs({active}:{active:PlanningView}){
 const tabs=[
  {key:"candidates" as const,label:"Candidate Jobs",href:"/planning"},
  {key:"batches" as const,label:"Recent Planning Batches",href:"/planning/batches"}
 ];

 return <nav className="planning-view-tabs" aria-label="Planning views">
  {tabs.map(tab=><Link
   key={tab.key}
   href={tab.href}
   aria-current={active===tab.key?"page":undefined}
   className={`planning-view-tab ${active===tab.key?"active":""}`}
  >
   {tab.label}
  </Link>)}
 </nav>;
}
