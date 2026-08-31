import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {loadPlanningCandidates} from "@/lib/planning/candidate-data";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";

type SnapshotMeta={
 hit:boolean;
 fallback:boolean;
 serveMs:number;
 sourceVersion:number|null;
 refreshedAt:string|null;
 buildMs:number|null;
 candidateCount:number;
 scopeKey:string;
};

type Args={
 areaId:string;
 op:string;
 recipeKey:string;
 previousBatchNo:string;
 requestedPage:number;
 pageSize:number|null;
 knownTotalCandidates:number|null;
 force?:boolean;
};

function makeScopeKey(scope:unknown){
 return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

// v322: environments without migrations 058/059 have no snapshot tables. Detect
// ONCE and skip the snapshot layer entirely, otherwise every request would do
// TWO canonical loads (one inside the tx, one in the fallback) for nothing.
let snapshotSupport:boolean|null=null;
async function snapshotTablesExist(c:PoolClient):Promise<boolean>{
 if(snapshotSupport!==null)return snapshotSupport;
 try{
  const q=await c.query(`select
   to_regclass('public.planning_candidate_snapshot') as t1,
   to_regclass('public.planning_snapshot_state') as t2`);
  snapshotSupport=Boolean(q.rows[0]?.t1&&q.rows[0]?.t2);
 }catch{snapshotSupport=false;}
 return snapshotSupport;
}

async function loadCanonical(c:PoolClient,args:Args){
 const {stViewParams,initialView,serverViews}=await resolvePlanningView(c,args.op,args.areaId);
 const data=await loadPlanningCandidates(c,{
  areaId:args.areaId,
  op:args.op,
  recipeKey:args.recipeKey,
  previousBatchNo:args.previousBatchNo,
  requestedPage:args.requestedPage,
  pageSize:args.pageSize,
  stViewParams,
  knownTotalCandidates:args.pageSize===null?null:args.knownTotalCandidates
 });
 return {data,initialView,serverViews};
}

/**
 * v317 primary Planning Board read path.
 * Canonical business logic remains resolvePlanningView() + loadPlanningCandidates().
 * Snapshot is only a persisted read cache.
 */
export async function loadPlanningCandidatesFromSnapshot(c:PoolClient,args:Args){
 const requestStarted=Date.now();
 const scope={
  areaId:args.areaId,
  op:args.op,
  recipeKey:args.recipeKey,
  previousBatchNo:args.previousBatchNo,
  requestedPage:args.requestedPage,
  pageSize:args.pageSize
 };
 const scopeKey=makeScopeKey(scope);

 if(!await snapshotTablesExist(c)){
  const {data,initialView,serverViews}=await loadCanonical(c,args);
  const meta:SnapshotMeta & {fallbackReason?:string}={
   hit:false,
   fallback:true,
   serveMs:Date.now()-requestStarted,
   sourceVersion:null,
   refreshedAt:null,
   buildMs:null,
   candidateCount:Array.isArray(data.candidates)?data.candidates.length:0,
   scopeKey,
   fallbackReason:"snapshot tables missing (058/059 not applied)"
  };
  return {...data,initialView,serverViews,_snapshot:meta};
 }

 try{
  if(!args.force){
   const cached=await c.query(`
    select
      s.source_version,
      p.payload,
      p.candidate_count,
      p.build_ms,
      p.refreshed_at
    from planning_snapshot_state s
    left join planning_candidate_snapshot p
      on p.scope_key=$1
     and p.source_version=s.source_version
    where s.singleton=true
    limit 1
   `,[scopeKey]);
   const row=cached.rows[0];
   if(row?.payload){
    const sourceVersion=Number(row.source_version||1);
    const meta:SnapshotMeta={
     hit:true,
     fallback:false,
     serveMs:Date.now()-requestStarted,
     sourceVersion,
     refreshedAt:row.refreshed_at?new Date(row.refreshed_at).toISOString():null,
     buildMs:row.build_ms==null?null:Number(row.build_ms),
     candidateCount:Number(row.candidate_count||0),
     scopeKey
    };
    return {...row.payload,_snapshot:meta};
   }
  }

  const started=Date.now();
  await c.query("begin isolation level repeatable read");
  try{
   const state=await c.query(`select source_version from planning_snapshot_state where singleton=true`);
   const txVersion=Number(state.rows[0]?.source_version||1);
   const {data,initialView,serverViews}=await loadCanonical(c,args);
   const payload={...data,initialView,serverViews};
   const buildMs=Date.now()-started;
   const candidateCount=Array.isArray(data.candidates)?data.candidates.length:0;

   await c.query(`
    insert into planning_candidate_snapshot(
      scope_key,source_version,scope_payload,payload,candidate_count,build_ms,refreshed_at
    ) values($1,$2,$3::jsonb,$4::jsonb,$5,$6,now())
    on conflict(scope_key) do update set
      source_version=excluded.source_version,
      scope_payload=excluded.scope_payload,
      payload=excluded.payload,
      candidate_count=excluded.candidate_count,
      build_ms=excluded.build_ms,
      refreshed_at=now()
   `,[scopeKey,txVersion,JSON.stringify(scope),JSON.stringify(payload),candidateCount,buildMs]);
   await c.query("commit");

   const meta:SnapshotMeta={
    hit:false,
    fallback:false,
    serveMs:Date.now()-requestStarted,
    sourceVersion:txVersion,
    refreshedAt:new Date().toISOString(),
    buildMs,
    candidateCount,
    scopeKey
   };
   return {...payload,_snapshot:meta};
  }catch(e){
   await c.query("rollback").catch(()=>{});
   throw e;
  }
 }catch(e){
  // v320: Snapshot is a read-cache only. A cache read/build/write failure must
  // never make Candidate Jobs unavailable. The canonical resolver remains the
  // source of truth, so retry directly through that exact path for ANY
  // Snapshot-layer failure. If canonical itself is broken, loadCanonical()
  // will throw and the API will still correctly surface the real DB error.
  const snapshotError=e instanceof Error?e.message:String(e);
  const {data,initialView,serverViews}=await loadCanonical(c,args);
  const candidateCount=Array.isArray(data.candidates)?data.candidates.length:0;
  const meta:SnapshotMeta & {fallbackReason?:string}={
   hit:false,
   fallback:true,
   serveMs:Date.now()-requestStarted,
   sourceVersion:null,
   refreshedAt:null,
   buildMs:null,
   candidateCount,
   scopeKey,
   fallbackReason:snapshotError.slice(0,300)
  };
  return {...data,initialView,serverViews,_snapshot:meta};
 }
}
