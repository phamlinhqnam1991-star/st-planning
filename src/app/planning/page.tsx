import {AppTabs} from "@/components/app-tabs";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {PlanningCandidateShell} from "@/components/planning-candidate-shell";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {getPlanningStaticData} from "@/lib/planning/planning-static-cache";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";

export const dynamic="force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>}){
 const sp=await searchParams;
 const areaId=(sp.area||"").trim();
 const op=(sp.op||"").trim();
 const recipeKey=(sp.recipe||"").trim();
 const previousBatchNo=(sp.prevBatch||"").trim();
 // v298: pagination removed — the board always loads ALL Candidates in one
 // request (pageSize=all). The server no longer runs the filtered COUNT query.

 // v283: SSR renders only the Planning shell + cached master data.
 // Candidate metadata is fetched immediately after mount, while Route Matrix is
 // lazy-loaded afterwards. This keeps the first HTML response independent from
 // the heavy Candidate/route_status SQL.
 const staticDataPromise=getPlanningStaticData();
 const c=await getPool().connect();
 try{
  const [{initialView,serverViews},batchesQ,staticData]=await Promise.all([
   resolvePlanningView(c,op,areaId),
   getRecentPlanningBatches(c,100),
   staticDataPromise
  ]);
  const today=new Date().toISOString().slice(0,10);

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1><p>Surface Treatment Planning System</p></div>
    <div className="erp-env">PLANNING BOARD</div>
   </header>
   <AppTabs active="planning"/>
   <section className="erp-content erp-content-full planning-page planning-candidate-page">
    <div className="erp-page-head"><div><h2>Planning Board</h2><p>AllOperation sequence → Eligible Jobs → Candidate selection → Production Batch</p></div></div>
    <PlanningViewTabs active="candidates"/>
    <PlanningCandidateShell
     areas={staticData.areas as any[]}
     operations={staticData.operations as any[]}
     availableBatches={batchesQ.rows as any[]}
     mainOperations={staticData.matrixOperations as any[]}
     stOperations={staticData.visibleOperations as any[]}
     nextOperations={staticData.nextOperations as any[]}
     sourceColumns={staticData.sourceColumns as string[]}
     operationMappings={staticData.operationMappings as any[]}
     initial={{
      areaId,op,recipeKey,previousBatchNo,
      candidates:[],recipeOptions:[],timeRules:[],
      initialView,serverViews,
      pagination:{page:1,pageSize:0,totalCandidates:0,totalPages:1},
      today
     }}
    />
   </section>
  </main>;
 }finally{c.release();}
}
