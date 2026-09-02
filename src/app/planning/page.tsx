import Link from "next/link";
import {PlanningCandidateShell} from "@/components/planning-candidate-shell";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpPageHeader,ErpTabs} from "@/components/erp";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {getPlanningStaticData} from "@/lib/planning/planning-static-cache";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidateMetadata} from "@/lib/planning/candidate-data";
import {ST_ERP_MODULES} from "@/lib/erp/st-navigation";

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
 const scoped=(base:string)=>scopeQuery?`${base}?${scopeQuery}`:base;
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

  return <ErpAppShell
   moduleItems={ST_ERP_MODULES}
   activeModule="planning"
   environment="ERP PLANNING"
   userArea={<LogoutButton/>}
   breadcrumb={<><Link href="/planning">Planning</Link><span>/</span><b>Matrix</b></>}
  >
   <div className="planning-erp-version">
    <ErpPageHeader
     eyebrow="PLANNING / BATCH"
     title="Planning Board"
     description="Matrix theo Job × Main Operation · chọn READY trực tiếp để tạo hoặc thêm vào Batch."
     status={<span className="erpkit-status erpkit-status-success">ERP</span>}
     actions={<Link className="erpkit-btn" href={scoped("/planning-old")}>Mở baseline cũ</Link>}
    />

    <ErpTabs
     active="matrix"
     items={[
      {key:"matrix",label:"Planning Matrix",href:scoped("/planning")},
      {key:"batches",label:"Recent Planning Batches",href:scoped("/planning/batches"),count:batchesQ.rows.length},
     ]}
    />

    <section className="erpkit-planning-live-shell">
     <PlanningCandidateShell
      presentation="erp"
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
   </div>
  </ErpAppShell>;
 }finally{c.release();}
}
