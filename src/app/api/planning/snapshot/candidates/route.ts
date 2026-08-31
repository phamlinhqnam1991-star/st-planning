import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidates} from "@/lib/planning/candidate-data";

export const maxDuration=60;

type SnapshotMeta={
 hit:boolean;
 serveMs:number;
 sourceVersion:number;
 refreshedAt:string|null;
 buildMs:number|null;
 candidateCount:number;
 scopeKey:string;
};

function makeScopeKey(scope:unknown){
 return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

async function currentVersion(c:any){
 const q=await c.query(`
  select source_version
  from planning_snapshot_state
  where singleton=true
 `);
 return Number(q.rows[0]?.source_version||1);
}

export async function GET(req:NextRequest){
 const requestStarted=Date.now();
 const denied=await requireApiUser();
 if(denied)return denied;

 const sp=req.nextUrl.searchParams;
 const areaId=(sp.get("area")||"").trim();
 const op=(sp.get("op")||"").trim();
 const recipeKey=(sp.get("recipe")||"").trim();
 const previousBatchNo=(sp.get("prevBatch")||"").trim();
 const force=(sp.get("force")||"")==="1";

 const c=await getPool().connect();
 try{
  const {stViewParams,initialView,serverViews}=await resolvePlanningView(c,op,areaId);
  const scope={areaId,op,recipeKey,previousBatchNo,stViewParams};
  const scopeKey=makeScopeKey(scope);
  const sourceVersion=await currentVersion(c);

  if(!force){
   const cached=await c.query(`
    select payload,candidate_count,build_ms,refreshed_at
    from planning_candidate_snapshot_test
    where scope_key=$1 and source_version=$2
    limit 1
   `,[scopeKey,sourceVersion]);
   if(cached.rows[0]){
    const row=cached.rows[0];
    const meta:SnapshotMeta={
     hit:true,
     serveMs:Date.now()-requestStarted,
     sourceVersion,
     refreshedAt:row.refreshed_at?new Date(row.refreshed_at).toISOString():null,
     buildMs:row.build_ms==null?null:Number(row.build_ms),
     candidateCount:Number(row.candidate_count||0),
     scopeKey
    };
    return NextResponse.json({...row.payload,_snapshot:meta});
   }
  }

  // Build through the SAME canonical Candidate function used by /planning.
  // No alternate READY / Chain / NO_CHAIN logic exists in this TEST route.
  const started=Date.now();
  await c.query("begin isolation level repeatable read");
  try{
   const txVersion=await currentVersion(c);
   const data=await loadPlanningCandidates(c,{
    areaId,op,recipeKey,previousBatchNo,
    requestedPage:1,pageSize:null,stViewParams,
    knownTotalCandidates:null
   });
   const payload={...data,initialView,serverViews};
   const buildMs=Date.now()-started;
   const candidateCount=Array.isArray(data.candidates)?data.candidates.length:0;

   await c.query(`
    insert into planning_candidate_snapshot_test(
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
    serveMs:Date.now()-requestStarted,
    sourceVersion:txVersion,
    refreshedAt:new Date().toISOString(),
    buildMs,
    candidateCount,
    scopeKey
   };
   return NextResponse.json({...payload,_snapshot:meta});
  }catch(e){
   await c.query("rollback").catch(()=>{});
   throw e;
  }
 }catch(e){
  const msg=e instanceof Error?e.message:String(e);
  if(/planning_snapshot_state|planning_candidate_snapshot_test/i.test(msg)){
   return NextResponse.json({
    error:"Chưa chạy migration 058_planning_board_snapshot_test.sql cho tab Snapshot TEST.",
    detail:msg
   },{status:503});
  }
  return NextResponse.json({error:msg},{status:500});
 }finally{c.release();}
}
