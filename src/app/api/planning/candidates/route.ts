import {NextRequest,NextResponse} from "next/server";
import {getPool,getDbHostInfo} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {resolvePlanningView} from "@/lib/planning/planning-view-server";
import {loadPlanningCandidates} from "@/lib/planning/candidate-data";

// Candidate endpoint supports both progressive paging and an explicit all-mode.
// The current Planning Board uses 200-row progressive pages; keep headroom for
// large scopes and explicit all-mode/debug requests.
export const maxDuration=60;

// v322: canonical-only read path. Measured on live data (643 candidates):
// snapshot-first was SLOWER than canonical on warm Postgres buffers
// (JSONB round-trip ~0.5-1s vs SQL ~0.35s), so the snapshot cache stays off.
// The heavy cold-start cost was in loadLiveRecipeContext (md_process_requirement
// 2.1M rows + correlated EXISTS) — removed in live-recipe.ts.
//
// Every response carries `_debug` (timings + scope + db host) and every failure
// is logged server-side with the full error + stack.

export async function GET(req:NextRequest){
 const requestStarted=Date.now();
 const {denied,ctx}=await requireApiPermission("planning.view");
 if(denied){
  console.warn(`[candidates] REJECTED by auth (${denied.status}) scope=${JSON.stringify(debugScope(req.nextUrl.searchParams))}`);
  return denied;
 }
 const sp=req.nextUrl.searchParams;
 const areaId=(sp.get("area")||"").trim();
 const op=(sp.get("op")||"").trim();
 if(op&&ctx?.scopes.PLANNING_MAIN.size&&!ctx.scopes.PLANNING_MAIN.has(op.toUpperCase()))return NextResponse.json({error:`Không có quyền xem Main ${op}.`},{status:403});
 const recipeKey=(sp.get("recipe")||"").trim();
 const previousBatchNo=(sp.get("prevBatch")||"").trim();
 // Current board requests numeric pageSize=200 progressively. `all` remains a
 // supported API mode for explicit callers/debugging and skips the filtered COUNT.
 const rawPageSize=(sp.get("pageSize")||"all").trim().toLowerCase();
 const loadAll=rawPageSize!=="0"&&(rawPageSize==="all"||rawPageSize==="");
 const numericPageSize=Math.trunc(Number(rawPageSize)||200);
 const pageSize=loadAll?null:(([100,200,500] as number[]).includes(numericPageSize)?numericPageSize:200);
 const requestedPage=Math.max(1,Math.trunc(Number(sp.get("page"))||1));
 const knownTotalRaw=sp.get("knownTotal");
 const parsedKnownTotal=knownTotalRaw!==null&&knownTotalRaw!==""?Number(knownTotalRaw):NaN;
 const knownTotalCandidates=Number.isFinite(parsedKnownTotal)
  ?Math.max(0,Math.trunc(parsedKnownTotal))
  :null;
 // light=1 drops j.source_data (~2.8MB of the payload).
 const light=sp.get("light")==="1";
 const c=await getPool().connect();
 let destroyed=false;
 const timer=setTimeout(()=>{destroyed=true;},58000);
 try{
  const viewStart=Date.now();
  const {stViewParams,initialView,serverViews}=await resolvePlanningView(c,op,areaId);
  const viewMs=Date.now()-viewStart;
  const loadStart=Date.now();
  // v323: hard timeout so a wedged pool / dead network surfaces a clean error
  // instead of a request that hangs forever.
  const data=await Promise.race([
   loadPlanningCandidates(c,{
    areaId,op,recipeKey,previousBatchNo,requestedPage,pageSize,stViewParams,
    knownTotalCandidates:pageSize===null?null:knownTotalCandidates,
    light
   }),
   new Promise<never>((_,reject)=>{
    const t=setTimeout(()=>reject(new Error(`Candidate load timeout (>58s) — DB/kết nối quá chậm, bấm Thử lại.`)),58000);
    t.unref?.();
   })
  ]);
  const loadMs=Date.now()-loadStart;
  const totalMs=Date.now()-requestStarted;
  console.log(`[candidates] OK scope=${JSON.stringify({areaId,op,recipeKey,previousBatchNo,pageSize,light})} stView=${stViewParams.length} rows=${data.candidates?.length??"?"} viewMs=${viewMs} loadMs=${loadMs} totalMs=${totalMs}${data.timing?` queryMs=${data.timing.queryMs} recipeMs=${data.timing.recipeMs} mapMs=${data.timing.mapMs}`:""}`);
  return NextResponse.json({
   ...data,initialView,serverViews,
   _debug:{stage:"ok",totalMs,viewMs,loadMs,stViewCount:stViewParams.length,rows:Array.isArray(data.candidates)?data.candidates.length:0,scope:{areaId,op,recipeKey,previousBatchNo},light,db:getDbHostInfo(),timing:data.timing??null}
  });
 }catch(e){
  const message=e instanceof Error?e.message:String(e);
  const stack=e instanceof Error?(e.stack||""):"";
  const totalMs=Date.now()-requestStarted;
  console.error(`[candidates] ERROR scope=${JSON.stringify({areaId,op,recipeKey,previousBatchNo,pageSize,light})} after ${totalMs}ms: ${message}\n${stack}`);
  return NextResponse.json({
   error:message,
   _debug:{stage:"error",totalMs,scope:{areaId,op,recipeKey,previousBatchNo,pageSize,light},db:getDbHostInfo(),stack:stack.slice(0,2000)}
  },{status:500});
 }finally{
  clearTimeout(timer);
  if(destroyed){try{c.release(true);}catch{}}else c.release();
 }
}

function debugScope(sp:URLSearchParams){
 return {
  areaId:(sp.get("area")||"").trim(),
  op:(sp.get("op")||"").trim(),
  recipeKey:(sp.get("recipe")||"").trim(),
  previousBatchNo:(sp.get("prevBatch")||"").trim(),
  pageSize:(sp.get("pageSize")||"all").trim(),
  light:(sp.get("light")||"")==="1"
 };
}
