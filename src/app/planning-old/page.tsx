import {AppTabs} from "@/components/app-tabs";
import {PlanningViewTabs} from "@/components/planning-view-tabs";
import {PlanningCandidateShell} from "@/components/planning-candidate-shell";
import {LogoutButton} from "@/components/logout-button";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {getPlanningStaticData} from "@/lib/planning/planning-static-cache";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidateMetadata} from "@/lib/planning/candidate-data";

export const dynamic="force-dynamic";

export default async function Page({searchParams}:{searchParams:Promise<{area?:string;op?:string;recipe?:string;prevBatch?:string}>}){
 const sp=await searchParams;
 const areaId=(sp.area||"").trim();
 const op=(sp.op||"").trim();
 const recipeKey=(sp.recipe||"").trim();
 const previousBatchNo=(sp.prevBatch||"").trim();
 const scopeParams=new URLSearchParams();
 if(areaId)scopeParams.set("area",areaId);
 if(op)scopeParams.set("op",op);
 if(recipeKey)scopeParams.set("recipe",recipeKey);
 if(previousBatchNo)scopeParams.set("prevBatch",previousBatchNo);
 const scopeQuery=scopeParams.toString();
 const erpHref=scopeQuery?`/planning?${scopeQuery}`:"/planning";
 // Candidate rows are loaded progressively by PlanningCandidateShell (200/page).
 // SSR only preloads light metadata so the first HTML stays small.

 // v329: SSR preloads the light Candidate metadata (Recipe dropdown + Time
 // Rules for the Batch panel) via loadPlanningCandidateMetadata — two small
 // queries that never touch the heavy Candidate SQL. They are injected into
 // the initial props, so the filters are usable from the very first HTML
 // render and the client no longer waits for the heavy load to get them.
 // Route Matrix stays lazy-loaded afterwards.
 const staticDataPromise=getPlanningStaticData();
 const c=await getPool().connect();
 try{
  const [{initialView,serverViews},batchesQ,staticData,metadata]=await Promise.all([
   resolvePlanningView(c,op,areaId),
   getRecentPlanningBatches(c,100),
   staticDataPromise,
   loadPlanningCandidateMetadata({op,recipeKey})
  ]);
  const today=new Date().toISOString().slice(0,10);

  return <main className="erp-shell">
   <header className="erp-header">
    <div><h1>ST Planning</h1></div>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
     <div className="erp-env">PLANNING BOARD</div>
     <LogoutButton/>
    </div>
   </header>
   <AppTabs active="planning" presentation="legacy"/>
   <section className="erp-content erp-content-full planning-page planning-candidate-page">
    <div className="erp-page-head"><div><h2>Planning Board · Baseline cũ</h2><p>Bản giao diện cũ giữ nguyên để đối chiếu trong giai đoạn chuyển ERP.</p></div><a className="btn primary" href={erpHref}>Mở ERP version →</a></div>
    <PlanningViewTabs active="candidates" basePath="/planning-old"/>
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
      candidates:[],recipeOptions:metadata.recipeOptions,timeRules:metadata.timeRules,
      initialView,serverViews,
      pagination:{page:1,pageSize:0,totalCandidates:0,totalPages:1},
      today
     }}
    />
   </section>
  </main>;
 }finally{c.release();}
}
