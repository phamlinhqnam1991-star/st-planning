"use client";
import Link from "next/link";
import {useSearchParams} from "next/navigation";

type PlanningView="candidates"|"v2"|"batches";

// v320: tab switching keeps the real query-string scope (area/op/recipe/prevBatch)
// currently on the URL, so moving between Candidate Jobs / V2 / Recent Batches
// does not lose the filter context.
export function PlanningViewTabs({active}:{active:PlanningView}){
 const sp=useSearchParams();
 const scopeQuery=sp.toString();
 const href=(base:string)=>scopeQuery?`${base}?${scopeQuery}`:base;
 const tabs=[
  {key:"candidates" as const,label:"Candidate Jobs",href:href("/planning")},
  {key:"v2" as const,label:"Planning V2 (TEST)",href:href("/planning/v2")},
  {key:"batches" as const,label:"Recent Planning Batches",href:href("/planning/batches")}
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
