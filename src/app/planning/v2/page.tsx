import {AppTabs} from "@/components/app-tabs";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {PlanningV2Client} from "@/components/planning-v2/planning-v2-client";
import {getPlanningStaticData} from "@/lib/planning/planning-static-cache";

export const dynamic="force-dynamic";

export default async function PlanningV2Page({searchParams}:{searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>}){
 const sp=await searchParams;
 const staticData=await getPlanningStaticData();
 const today=new Date().toISOString().slice(0,10);
 const initialScope={areaId:(sp.area||"").trim(),op:(sp.op||"").trim(),recipeKey:(sp.recipe||"").trim(),previousBatchNo:(sp.prevBatch||"").trim()};
 return <main className="erp-shell">
  <header className="erp-header"><div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div><div className="erp-env">PLANNING V2 TEST</div></header>
  <AppTabs active="planning"/>
  <section className="erp-content erp-content-full planning-page planning-candidate-page">
   <div className="erp-page-head"><div><h2>Planning Board V2</h2><p>Rewritten UI architecture · same Candidate / Batch / Route business APIs</p></div></div>
   <PlanningViewTabs active="v2"/>
   <PlanningV2Client areas={staticData.areas as any[]} operations={staticData.operations as any[]} mainOperations={staticData.matrixOperations as any[]} today={today} initialScope={initialScope}/>
  </section>
 </main>;
}
