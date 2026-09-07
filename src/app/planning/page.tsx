import Link from "next/link";
import {PlanningCandidateShell} from "@/components/planning-candidate-shell";
import {LogoutButton} from "@/components/logout-button";
import {ErpAppShell,ErpPageHeader,ErpTabs} from "@/components/erp";
import {getPool} from "@/lib/db";
import {getRecentPlanningBatches} from "@/lib/planning/recent-batches";
import {getPlanningStaticData} from "@/lib/planning/planning-static-cache";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidateMetadata} from "@/lib/planning/candidate-data";
import {ST_ERP_MODULE_GROUPS} from "@/lib/erp/st-navigation";
import {getAccessContext} from "@/lib/security/access";

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
 // V442: resolve cached/static Planning data before reserving the single
 // Aiven pooled connection. With DB_POOL_MAX=1, starting this cache load and
 // then holding another client could create a circular wait on cold requests.
 const access=await getAccessContext();
 const planningScope=access?.scopes.PLANNING_MAIN||new Set<string>();
 if(op&&planningScope.size&&!planningScope.has(op.toUpperCase())){const {redirect}=await import("next/navigation");redirect("/access-denied");}
 const staticData=await getPlanningStaticData();
 const scopedOperations=planningScope.size?(staticData.operations as any[]).filter((x:any)=>planningScope.has(String(x.standard_operation||"").toUpperCase())):staticData.operations;
 const scopedMatrixOperations=planningScope.size?(staticData.matrixOperations as any[]).filter((x:any)=>planningScope.has(String(x.standard_operation||"").toUpperCase())):staticData.matrixOperations;
 const c=await getPool().connect();
 try{
  const [{initialView,serverViews},batchesQ,metadata]=await Promise.all([
   resolvePlanningView(c,op,areaId),
   getRecentPlanningBatches(c,100),
   loadPlanningCandidateMetadata({op,recipeKey},c)
  ]);
  const today=new Date().toISOString().slice(0,10);

  return <ErpAppShell
   moduleGroups={ST_ERP_MODULE_GROUPS}
   activeModule="operations"
   activeSecondary="planning"
   environment="ST PLANNING"
   userArea={<LogoutButton presentation="erp"/>}
   breadcrumb={<><Link href="/planning">Planning Board</Link><span>/</span><b>Ma trận kế hoạch</b></>}
  >
   <div className="planning-erp-version">
    <ErpPageHeader
     eyebrow="PLANNING BOARD"
     title="Planning Board"
     description="Ma trận Job × Main Operation · chọn READY để tạo mới hoặc bổ sung Job vào Batch."
     status={<span className="erpkit-status erpkit-status-success"><span className="erpkit-status-dot"/>LIVE</span>}
    />

    <ErpTabs
     active="matrix"
     items={[
      {key:"matrix",label:"Ma trận kế hoạch",href:scoped("/planning")},
      {key:"batches",label:"Batch gần đây",href:scoped("/planning/batches"),count:batchesQ.rows.length},
     ]}
    />

    <section className="erpkit-planning-live-shell">
     <PlanningCandidateShell
      presentation="erp"
      areas={staticData.areas as any[]}
      operations={scopedOperations as any[]}
      availableBatches={batchesQ.rows as any[]}
      mainOperations={scopedMatrixOperations as any[]}
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
