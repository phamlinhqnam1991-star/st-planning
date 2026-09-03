import {createHash,randomUUID} from "node:crypto";
import type {PoolClient} from "pg";

const clean=(v:unknown)=>String(v??"").trim().toUpperCase();

export type BridgeRebuildMode="FULL"|"INCREMENTAL";
export type BridgeRebuildStatus="RUNNING"|"READY_TO_FINALIZE"|"FINALIZING"|"COMPLETED"|"CANCELLED"|"FAILED";

export type BridgeRebuildRun={
 runId:string;
 mode:BridgeRebuildMode;
 status:BridgeRebuildStatus;
 totalRoutings:number;
 processedRoutings:number;
 lastRoutingCode:string|null;
 chunkSize:number;
 startedAt:string|null;
 updatedAt:string|null;
 completedAt:string|null;
 errorMessage:string|null;
};

type RouteRow={
 routing_code:string;
 seq:number;
 operation_code:string;
};

type MappingSnapshot={
 sourceOperationCode:string;
 stGroup:string;
 standardOperationRule:string;
 mappingRule:string;
};

type DiscoveredSegment={
 bridgeKey:string;
 previousMain:string;
 nextMain:string;
 intermediateOperations:string[];
 routeEvidence:{routingCode:string;previousMainSeq:number;nextMainSeq:number}[];
};

const makeBridgeKey=(previousMain:string,nextMain:string,ops:string[])=>
 `AUTO|${createHash("sha1").update(`${previousMain}|${ops.join(">")}|${nextMain}`).digest("hex")}`;

const asRun=(r:any):BridgeRebuildRun=>({
 runId:String(r.run_id),
 mode:String(r.mode) as BridgeRebuildMode,
 status:clean(r.status) as BridgeRebuildStatus,
 totalRoutings:Number(r.total_routings||0),
 processedRoutings:Number(r.processed_routings||0),
 lastRoutingCode:r.last_routing_code==null?null:String(r.last_routing_code),
 chunkSize:Number(r.chunk_size||150),
 startedAt:r.started_at==null?null:String(r.started_at),
 updatedAt:r.updated_at==null?null:String(r.updated_at),
 completedAt:r.completed_at==null?null:String(r.completed_at),
 errorMessage:r.error_message==null?null:String(r.error_message)
});

function classifyRouteByCanonicalPlanningSource(
 routeRows:RouteRow[],
 mainMappingBySource:Map<string,MappingSnapshot>,
 planningMain:Set<string>
){
 const mainBySeq=new Map<number,string>();
 const skippedSeq=new Set<number>();
 let primerOccurrence=0;
 let topcoatOccurrence=0;

 const isCanonicalPlanningSource=(code:string)=>mainMappingBySource.has(clean(code));
 const nearestPlanningSource=(index:number,direction:-1|1)=>{
  for(let i=index+direction;i>=0&&i<routeRows.length;i+=direction){
   const code=clean(routeRows[i]?.operation_code);
   if(!code)continue;
   if(code==="PIONBL")continue;
   const m=mainMappingBySource.get(code);
   if(!m)continue;
   if(clean(m.standardOperationRule)==="PIONBL")continue;
   return code;
  }
  return "";
 };

 for(let i=0;i<routeRows.length;i++){
  const row=routeRows[i];
  const source=clean(row.operation_code);
  if(!source)continue;

  // PIONBL is a canonical skip source. It remains in Standardized Routing for
  // traceability but never becomes a Main or Intermediate bridge occurrence.
  if(source==="PIONBL"){
   skippedSeq.add(row.seq);
   continue;
  }

  // CRITICAL v303 rule:
  // A routing occurrence is a Main ONLY when its SOURCE operation itself is
  // configured as PLANNING_OPERATION and has the deterministic winning live
  // mapping. An arbitrary active mapping is not enough. This is the same
  // source gate used to build ST Routing/Planning Chain and prevents raw
  // Intermediate operations with helper/stale mappings from being promoted to
  // Main, which previously collapsed almost every Bridge Segment.
  if(!isCanonicalPlanningSource(source))continue;
  const mapping=mainMappingBySource.get(source)!;

  // Raw aliases intentionally mapped to canonical PIONBL are skip too.
  if(clean(mapping.standardOperationRule)==="PIONBL"){
   skippedSeq.add(row.seq);
   continue;
  }

  let standardOperation="";
  if(mapping.stGroup==="PRIMER"){
   primerOccurrence++;
   standardOperation=primerOccurrence===1?"PRIMER":primerOccurrence===2?"PRIMER2":"PRIMER3";
  }else if(mapping.stGroup==="TOPCOAT"){
   topcoatOccurrence++;
   standardOperation=topcoatOccurrence===1?"TOPCOAT1":"TOPCOAT2";
  }else if(source==="HE-BAKE"){
   // Standardized Routing now includes raw Intermediate rows. Therefore use
   // the nearest PLANNING source on each side, not the immediately adjacent
   // raw row, exactly like rebuildAllStRoutingDerived().
   const prev=nearestPlanningSource(i,-1);
   const next=nearestPlanningSource(i,1);
   if(prev==="PLA-ZINI"||next==="PLA-CC")standardOperation="HE-BAKE AFTER PLATING";
   else if(next==="A-DBLST"||next==="M-DBLST")standardOperation="HE-BAKE BEFORE BLASTING";
   else standardOperation="HE-BAKE";
  }else{
   standardOperation=clean(mapping.standardOperationRule);
  }

  if(standardOperation==="PIONBL"){
   skippedSeq.add(row.seq);
   continue;
  }

  // Final defensive gate: dynamic standardization (PRIMER2, TOPCOAT2,
  // HE-BAKE variants...) must still belong to active Main Planning scope.
  if(standardOperation&&planningMain.has(standardOperation)){
   mainBySeq.set(row.seq,standardOperation);
  }
 }
 return {mainBySeq,skippedSeq};
}
function discoverSegments(
 rows:RouteRow[],
 planningMain:Set<string>,
 excludedOperations:Set<string>,
 mappingBySource:Map<string,MappingSnapshot>
){
 const byRoute=new Map<string,RouteRow[]>();
 for(const row of rows){
  if(!row.routing_code||!Number.isFinite(row.seq)||!row.operation_code)continue;
  const list=byRoute.get(row.routing_code)||[];
  list.push(row);byRoute.set(row.routing_code,list);
 }

 const aggregate=new Map<string,DiscoveredSegment>();
 let leadingIntermediate=0;
 let trailingIntermediate=0;
 let inferredOccurrences=0;
 let recognizedMainOccurrences=0;
 let routesWithTwoOrMoreMains=0;

 for(const [routingCode,routeRows] of byRoute){
  routeRows.sort((a,b)=>a.seq-b.seq);
  const classification=classifyRouteByCanonicalPlanningSource(routeRows,mappingBySource,planningMain);
  const mainBySeq=classification.mainBySeq;
  recognizedMainOccurrences+=mainBySeq.size;
  if(mainBySeq.size>=2)routesWithTwoOrMoreMains++;

  let previousMain:string|null=null;
  let previousMainSeq:number|null=null;
  let buffer:string[]=[];
  let sawMain=false;

  for(const row of routeRows){
   const resolvedMain=mainBySeq.get(row.seq)||"";
   const isMain=!!resolvedMain;
   const excluded=excludedOperations.has(row.operation_code) || classification.skippedSeq.has(row.seq);

   if(isMain){
    if(previousMain&&previousMainSeq!==null&&buffer.length){
     const key=makeBridgeKey(previousMain,resolvedMain,buffer);
     let seg=aggregate.get(key);
     if(!seg){
      seg={
       bridgeKey:key,
       previousMain,
       nextMain:resolvedMain,
       intermediateOperations:[...buffer],
       routeEvidence:[]
      };
      aggregate.set(key,seg);
     }
     seg.routeEvidence.push({routingCode,previousMainSeq,nextMainSeq:row.seq});
    }
    previousMain=resolvedMain;
    previousMainSeq=row.seq;
    buffer=[];
    sawMain=true;
    continue;
   }

   if(!excluded){
    if(previousMain){buffer.push(row.operation_code);inferredOccurrences++;}
    else leadingIntermediate++;
   }
  }
  if(sawMain&&buffer.length)trailingIntermediate+=buffer.length;
 }

 return {aggregate,leadingIntermediate,trailingIntermediate,inferredOccurrences,recognizedMainOccurrences,routesWithTwoOrMoreMains};
}

async function insertValues(
 c:PoolClient,
 sqlPrefix:string,
 rows:unknown[][],
 onConflict:string,
 chunkRows=1000
){
 if(!rows.length)return;
 for(let offset=0;offset<rows.length;offset+=chunkRows){
  const chunk=rows.slice(offset,offset+chunkRows);
  const params:unknown[]=[];
  let p=1;
  const values=chunk.map(row=>`(${row.map(v=>{params.push(v);return `$${p++}`}).join(",")})`).join(",");
  await c.query(`${sqlPrefix} values ${values} ${onConflict}`,params);
 }
}


async function sourceFingerprint(c:PoolClient){
 const q=await c.query(`
  select concat_ws('|',
   coalesce((select max(updated_at)::text from md_st_routing_summary),''),
   coalesce((select max(updated_at)::text from md_st_operation_mapping),''),
   coalesce((select max(updated_at)::text from md_planning_operation_scope),''),
   coalesce((select max(updated_at)::text from md_st_operation_scope where operation_type<>'INTERMEDIATE'),'')
  ) fingerprint
 `);
 return createHash("sha1").update(String(q.rows[0]?.fingerprint||"")).digest("hex");
}

async function lookupSnapshots(c:PoolClient){
 const mainQ=await c.query(`
  select upper(trim(standard_operation)) standard_operation
  from md_planning_operation_scope
  where is_active=true
 `);
 return {
  planningMainCodes:mainQ.rows.map((r:any)=>clean(r.standard_operation)).filter(Boolean),
  // v302: ST_SCOPE_ONLY is not a Main, but if it physically occurs between
  // two Main Planning occurrences in Standardized Routing it is still useful
  // as an Intermediate bridge marker. Only canonical skip operations are
  // removed from the ordered Intermediate signature.
  excludedOperationCodes:["PIONBL"]
 };
}

/**
 * Starts a durable rebuild run. FULL snapshots every routing_code that has
 * active rows in ST Routing Chain · Standardized (md_st_routing). Do NOT gate
 * FULL discovery by md_st_routing_summary.is_active: summary activity only
 * means a route is currently assigned to an active Part/Revision, while the
 * standardized route pattern can still be valid evidence for Intermediate
 * Bridge discovery. INCREMENTAL snapshots only the supplied routing codes; codes
 * that are no longer active are intentionally kept in the run list so Finalize
 * can remove their old route evidence.
 */
export async function startIntermediateBridgeRebuild(
 c:PoolClient,
 opts:{mode?:BridgeRebuildMode;routingCodes?:string[];chunkSize?:number;cancelExisting?:boolean}={}
):Promise<BridgeRebuildRun>{
 const mode:BridgeRebuildMode=opts.mode||"FULL";
 const chunkSize=Math.max(25,Math.min(500,Number(opts.chunkSize||150)));

 const existing=await c.query(`
  select * from md_intermediate_bridge_rebuild_run
  where status in ('RUNNING','READY_TO_FINALIZE','FINALIZING','FAILED')
  order by updated_at desc limit 1
  for update
 `);
 if(existing.rowCount&&!opts.cancelExisting)return asRun(existing.rows[0]);
 if(existing.rowCount&&opts.cancelExisting){
  await c.query(`
   update md_intermediate_bridge_rebuild_run
      set status='CANCELLED',completed_at=now(),updated_at=now(),error_message=null
    where run_id=$1
  `,[existing.rows[0].run_id]);
 }

 const {planningMainCodes,excludedOperationCodes}=await lookupSnapshots(c);
 const fingerprint=await sourceFingerprint(c);
 const runId=`BR_${new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}_${randomUUID().slice(0,8).toUpperCase()}`;
 let routingCodes:string[]=[];
 if(mode==="FULL"){
  const q=await c.query(`
   select distinct r.routing_code
   from md_st_routing r
   where r.is_active=true
     and nullif(trim(r.routing_code),'') is not null
   order by r.routing_code
  `);
  routingCodes=q.rows.map((r:any)=>String(r.routing_code));
 }else{
  routingCodes=[...new Set((opts.routingCodes||[]).map(clean).filter(Boolean))].sort();
 }

 const status:BridgeRebuildStatus=routingCodes.length?"RUNNING":"READY_TO_FINALIZE";
 const totalRoutings=routingCodes.length;
 await c.query(`
  insert into md_intermediate_bridge_rebuild_run(
   run_id,mode,status,total_routings,processed_routings,last_routing_code,chunk_size,
   planning_main_codes,excluded_operation_codes,source_fingerprint,started_at,updated_at
  ) values($1,$2,$3,$4,0,null,$5,$6::text[],$7::text[],$8,now(),now())
 `,[runId,mode,status,totalRoutings,chunkSize,planningMainCodes,excludedOperationCodes,fingerprint]);

 if(routingCodes.length){
  await insertValues(
   c,
   `insert into md_intermediate_bridge_rebuild_route(run_id,route_index,routing_code)`,
   routingCodes.map((code,i)=>[runId,i+1,code]),
   `on conflict(run_id,routing_code) do nothing`
  );
 }
 return await getIntermediateBridgeRebuildRun(c,runId) as BridgeRebuildRun;
}

export async function getIntermediateBridgeRebuildRun(c:PoolClient,runId:string):Promise<BridgeRebuildRun|null>{
 const q=await c.query(`select * from md_intermediate_bridge_rebuild_run where run_id=$1`,[runId]);
 return q.rowCount?asRun(q.rows[0]):null;
}

export async function getLatestIncompleteIntermediateBridgeRebuild(c:PoolClient):Promise<BridgeRebuildRun|null>{
 const q=await c.query(`
  select * from md_intermediate_bridge_rebuild_run
  where status in ('RUNNING','READY_TO_FINALIZE','FINALIZING','FAILED')
  order by updated_at desc limit 1
 `);
 return q.rowCount?asRun(q.rows[0]):null;
}

export async function getIntermediateBridgeRebuildOverview(c:PoolClient){
 const [run,activeQ]=await Promise.all([
  getLatestIncompleteIntermediateBridgeRebuild(c),
  c.query(`
   select
    count(*) filter(where is_active=true and source='AUTO_ROUTING')::int active_segments,
    coalesce(sum(route_count) filter(where is_active=true and source='AUTO_ROUTING'),0)::int active_route_evidence
   from md_intermediate_bridge_segment
  `)
 ]);
 return {
  run,
  activeSegments:Number(activeQ.rows[0]?.active_segments||0),
  activeRouteEvidence:Number(activeQ.rows[0]?.active_route_evidence||0)
 };
}

export async function processIntermediateBridgeRebuildChunk(
 c:PoolClient,
 runId:string,
 requestedChunkSize?:number
){
 const lock=await c.query(`select * from md_intermediate_bridge_rebuild_run where run_id=$1 for update`,[runId]);
 if(!lock.rowCount)throw new Error("Không tìm thấy Auto Bridge rebuild run.");
 const run=asRun(lock.rows[0]);
 const currentFingerprint=await sourceFingerprint(c);
 if(String(lock.rows[0].source_fingerprint||"")!==currentFingerprint){
  throw new Error("Nguồn ST Routing/Main Planning đã thay đổi trong lúc Rebuild. Hãy Hủy & làm lại để tránh trộn hai generation.");
 }
 if(!["RUNNING","FAILED"].includes(run.status)){
  return {run,batchStart:null,batchEnd:null,routingsProcessed:0,segmentsFound:0,inferredOccurrences:0,leadingIntermediate:0,trailingIntermediate:0};
 }
 const chunkSize=Math.max(25,Math.min(500,Number(requestedChunkSize||run.chunkSize||150)));
 if(run.status==="FAILED"){
  await c.query(`update md_intermediate_bridge_rebuild_run set status='RUNNING',error_message=null,updated_at=now() where run_id=$1`,[runId]);
 }

 const routeQ=await c.query(`
  select route_index,routing_code
  from md_intermediate_bridge_rebuild_route
  where run_id=$1 and processed_at is null
  order by route_index
  limit $2
  for update skip locked
 `,[runId,chunkSize]);

 if(!routeQ.rowCount){
  await c.query(`
   update md_intermediate_bridge_rebuild_run
      set status='READY_TO_FINALIZE',processed_routings=total_routings,updated_at=now()
    where run_id=$1
  `,[runId]);
  return {
   run:await getIntermediateBridgeRebuildRun(c,runId),batchStart:null,batchEnd:null,
   routingsProcessed:0,segmentsFound:0,inferredOccurrences:0,leadingIntermediate:0,trailingIntermediate:0
  };
 }

 const routingCodes=routeQ.rows.map((r:any)=>String(r.routing_code));
 const rowsQ=await c.query(`
  select
   r.routing_code,
   r.seq,
   upper(trim(coalesce(r.operation_code,''))) operation_code
  from md_st_routing r
  where r.is_active=true
    and r.routing_code=any($1::text[])
  order by r.routing_code,r.seq
 `,[routingCodes]);

 const planningMain=new Set<string>((lock.rows[0].planning_main_codes||[]).map(clean).filter(Boolean));
 const excluded=new Set<string>((lock.rows[0].excluded_operation_codes||[]).map(clean).filter(Boolean));

 // v303 canonical Main identity:
 // Source Operation must itself be configured PLANNING_OPERATION, then use its
 // deterministic LIVE mapping. This is exactly the source gate used by
 // rebuildAllStRoutingDerived()/syncPlanningChains(). Any other raw operation
 // between two consecutive canonical Mains is inferred as Intermediate.
 const mappingQ=await c.query(`
  with ranked as (
   select
    upper(trim(m.source_operation_code)) source_operation_code,
    upper(trim(m.st_group)) st_group,
    upper(trim(m.standard_operation_rule)) standard_operation_rule,
    upper(trim(m.mapping_rule)) mapping_rule,
    row_number() over(
     partition by upper(trim(m.source_operation_code))
     order by
      case
       when m.mapping_rule='DIRECT' then 0
       when m.mapping_rule='SEQUENCE/FALLBACK' then 1
       else 2
      end,
      coalesce(m.sort_order,2147483647),
      m.updated_at desc nulls last,
      m.created_at desc nulls last,
      m.id desc
    ) rn
   from md_st_operation_mapping m
   join md_st_operation_scope scope
     on scope.is_active=true
    and scope.operation_type='PLANNING_OPERATION'
    and upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
   where m.is_active=true
  )
  select source_operation_code,st_group,standard_operation_rule,mapping_rule
  from ranked where rn=1
 `);
 const skipAliasQ=await c.query(`
  select distinct upper(trim(source_operation_code)) source_operation_code
  from md_st_operation_mapping
  where is_active=true
    and upper(trim(standard_operation_rule))='PIONBL'
 `);
 for(const r of skipAliasQ.rows){
  const code=clean(r.source_operation_code);
  if(code)excluded.add(code);
 }
 const mappingBySource=new Map<string,MappingSnapshot>();
 for(const r of mappingQ.rows){
  const source=clean(r.source_operation_code);
  if(!source)continue;
  mappingBySource.set(source,{
   sourceOperationCode:source,
   stGroup:clean(r.st_group),
   standardOperationRule:clean(r.standard_operation_rule),
   mappingRule:clean(r.mapping_rule)
  });
 }
 const rows:RouteRow[]=rowsQ.rows.map((r:any)=>({
  routing_code:String(r.routing_code),seq:Number(r.seq),operation_code:clean(r.operation_code)
 }));
 const found=discoverSegments(rows,planningMain,excluded,mappingBySource);

 const stageSegments:unknown[][]=[];
 const stageOps:unknown[][]=[];
 const stageRoutes:unknown[][]=[];
 for(const seg of found.aggregate.values()){
  stageSegments.push([runId,seg.bridgeKey,seg.previousMain,seg.nextMain,seg.intermediateOperations.join(" > "),seg.routeEvidence.length]);
  seg.intermediateOperations.forEach((op,i)=>stageOps.push([runId,seg.bridgeKey,i+1,op]));
  seg.routeEvidence.forEach(ev=>stageRoutes.push([runId,seg.bridgeKey,ev.routingCode,ev.previousMainSeq,ev.nextMainSeq]));
 }

 await insertValues(
  c,
  `insert into md_intermediate_bridge_stage_segment(run_id,bridge_key,previous_main_operation,next_main_operation,intermediate_signature,route_count)`,
  stageSegments,
  `on conflict(run_id,bridge_key) do update set
    previous_main_operation=excluded.previous_main_operation,
    next_main_operation=excluded.next_main_operation,
    intermediate_signature=excluded.intermediate_signature,
    route_count=md_intermediate_bridge_stage_segment.route_count+excluded.route_count`
 );
 await insertValues(
  c,
  `insert into md_intermediate_bridge_stage_operation(run_id,bridge_key,sequence_no,operation_code)`,
  stageOps,
  `on conflict(run_id,bridge_key,sequence_no) do update set operation_code=excluded.operation_code`
 );
 await insertValues(
  c,
  `insert into md_intermediate_bridge_stage_route(run_id,bridge_key,routing_code,previous_main_seq,next_main_seq)`,
  stageRoutes,
  `on conflict do nothing`
 );

 await c.query(`
  update md_intermediate_bridge_rebuild_route
     set processed_at=now()
   where run_id=$1 and route_index=any($2::int[])
 `,[runId,routeQ.rows.map((r:any)=>Number(r.route_index))]);
 const progress=await c.query(`
  update md_intermediate_bridge_rebuild_run r
     set processed_routings=x.processed,
         last_routing_code=$2,
         status=case when x.processed>=r.total_routings then 'READY_TO_FINALIZE' else 'RUNNING' end,
         updated_at=now(),error_message=null
    from (
      select count(*) filter(where processed_at is not null)::int processed
      from md_intermediate_bridge_rebuild_route where run_id=$1
    ) x
   where r.run_id=$1
   returning r.*
 `,[runId,routingCodes[routingCodes.length-1]]);

 return {
  run:asRun(progress.rows[0]),
  batchStart:Number(routeQ.rows[0].route_index),
  batchEnd:Number(routeQ.rows[routeQ.rows.length-1].route_index),
  routingsProcessed:routingCodes.length,
  segmentsFound:found.aggregate.size,
  inferredOccurrences:found.inferredOccurrences,
  leadingIntermediate:found.leadingIntermediate,
  trailingIntermediate:found.trailingIntermediate,
  recognizedMainOccurrences:found.recognizedMainOccurrences,
  routesWithTwoOrMoreMains:found.routesWithTwoOrMoreMains,
  canonicalPlanningSourceMappings:mappingBySource.size,
  planningMainCodes:planningMain.size
 };
}

export async function markIntermediateBridgeRebuildFailed(c:PoolClient,runId:string,error:string){
 await c.query(`
  update md_intermediate_bridge_rebuild_run
     set status='FAILED',error_message=$2,updated_at=now()
   where run_id=$1 and status not in ('COMPLETED','CANCELLED')
 `,[runId,error.slice(0,4000)]);
}

export async function cancelIntermediateBridgeRebuild(c:PoolClient,runId:string){
 const q=await c.query(`
  update md_intermediate_bridge_rebuild_run
     set status='CANCELLED',completed_at=now(),updated_at=now(),error_message=null
   where run_id=$1 and status not in ('COMPLETED','CANCELLED')
   returning *
 `,[runId]);
 await c.query(`delete from md_intermediate_bridge_rebuild_route where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_route where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_operation where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_segment where run_id=$1`,[runId]);
 return q.rowCount?asRun(q.rows[0]):await getIntermediateBridgeRebuildRun(c,runId);
}

/**
 * Publishes staged data in one DB transaction. Readers continue seeing the old
 * ACTIVE bridge set until the surrounding transaction commits.
 *
 * FULL: replace the entire AUTO_ROUTING generation.
 * INCREMENTAL: replace only route evidence for routing_codes in this run, then
 * recompute affected segment counts. Unaffected routes/segments are preserved.
 */
export async function finalizeIntermediateBridgeRebuild(c:PoolClient,runId:string){
 const lock=await c.query(`select * from md_intermediate_bridge_rebuild_run where run_id=$1 for update`,[runId]);
 if(!lock.rowCount)throw new Error("Không tìm thấy Auto Bridge rebuild run.");
 let run=asRun(lock.rows[0]);
 if(run.status==="COMPLETED")return {run,published:false};
 if(run.status==="CANCELLED")throw new Error("Auto Bridge rebuild run đã bị hủy; hãy tạo Full Rebuild mới.");
 const currentFingerprint=await sourceFingerprint(c);
 if(String(lock.rows[0].source_fingerprint||"")!==currentFingerprint){
  throw new Error("Nguồn ST Routing/Main Planning đã thay đổi sau khi Rebuild bắt đầu. Không Finalize generation cũ; hãy Hủy & làm lại.");
 }

 // v306: authoritative completion check. Status is only a workflow marker and
 // may be FAILED after a previous Finalize attempt. The durable route snapshot
 // is the source of truth: when no route remains unprocessed, Finalize is safe
 // to retry because the whole publish is inside the caller transaction.
 const routeProgressQ=await c.query(`
  select
   count(*)::int total_rows,
   count(*) filter(where processed_at is not null)::int processed_rows,
   count(*) filter(where processed_at is null)::int remaining_rows
  from md_intermediate_bridge_rebuild_route
  where run_id=$1
 `,[runId]);
 const totalRows=Number(routeProgressQ.rows[0]?.total_rows||0);
 const processedRows=Number(routeProgressQ.rows[0]?.processed_rows||0);
 const remainingRows=Number(routeProgressQ.rows[0]?.remaining_rows||0);

 if(totalRows!==run.totalRoutings){
  throw new Error(`Snapshot routing của Rebuild không khớp (${totalRows}/${run.totalRoutings}). Hãy Hủy & làm lại để tránh publish thiếu dữ liệu.`);
 }
 if(remainingRows>0){
  await c.query(`
   update md_intermediate_bridge_rebuild_run
      set processed_routings=$2,
          status=case when status='FAILED' then 'FAILED' else 'RUNNING' end,
          updated_at=now()
    where run_id=$1
  `,[runId,processedRows]);
  throw new Error(`Rebuild còn ${remainingRows.toLocaleString()} routing chưa xử lý (${processedRows}/${run.totalRoutings}).`);
 }

 // All snapshot routes are complete. Normalize stale RUNNING/FAILED/READY states
 // to FINALIZING and allow an idempotent retry after a previous failed publish.
 const finalizingQ=await c.query(`
  update md_intermediate_bridge_rebuild_run
     set status='FINALIZING',
         processed_routings=total_routings,
         error_message=null,
         updated_at=now()
   where run_id=$1 and status<>'CANCELLED'
   returning *
 `,[runId]);
 if(!finalizingQ.rowCount)throw new Error("Auto Bridge rebuild run không còn ở trạng thái có thể Finalize.");
 run=asRun(finalizingQ.rows[0]);

 // v307: same-name Main endpoints are valid when they are different route
 // occurrences (for example CPBILP#1 -> [X] -> CPBILP#2). The old schema
 // compared only the names and rejected these legitimate bridges. Before
 // publishing, validate the actual occurrence evidence instead: endpoint names
 // must be non-blank and every route occurrence must move forward by seq.
 const stageIntegrityQ=await c.query(`
  select
   count(*) filter(
    where nullif(trim(previous_main_operation),'') is null
       or nullif(trim(next_main_operation),'') is null
   )::int invalid_endpoint_rows,
   count(*) filter(
    where upper(trim(previous_main_operation))=upper(trim(next_main_operation))
   )::int same_main_name_rows
  from md_intermediate_bridge_stage_segment
  where run_id=$1
 `,[runId]);
 const invalidEndpointRows=Number(stageIntegrityQ.rows[0]?.invalid_endpoint_rows||0);
 if(invalidEndpointRows>0){
  throw new Error(`Auto Bridge staging có ${invalidEndpointRows} Segment thiếu Previous/Next Main; không publish để tránh dữ liệu lỗi.`);
 }
 const invalidSeqQ=await c.query(`
  select count(*)::int invalid_seq_rows
  from md_intermediate_bridge_stage_route
  where run_id=$1
    and (previous_main_seq is null or next_main_seq is null or previous_main_seq>=next_main_seq)
 `,[runId]);
 const invalidSeqRows=Number(invalidSeqQ.rows[0]?.invalid_seq_rows||0);
 if(invalidSeqRows>0){
  throw new Error(`Auto Bridge staging có ${invalidSeqRows} route evidence sai thứ tự seq (Previous Main phải đứng trước Next Main); không publish.`);
 }

 // Upsert the staged segment definitions first; bridge_key is the stable
 // Previous Main + ordered Intermediate signature + Next Main identity.
 // previous_main_operation === next_main_operation is intentionally allowed in
 // v307 because occurrence identity is carried by route seq evidence.
 await c.query(`
  insert into md_intermediate_bridge_segment(
   bridge_key,previous_main_operation,next_main_operation,intermediate_signature,
   source,route_count,is_active,updated_at
  )
  select
   bridge_key,previous_main_operation,next_main_operation,intermediate_signature,
   'AUTO_ROUTING',route_count,true,now()
  from md_intermediate_bridge_stage_segment
  where run_id=$1
  on conflict(bridge_key) do update set
   previous_main_operation=excluded.previous_main_operation,
   next_main_operation=excluded.next_main_operation,
   intermediate_signature=excluded.intermediate_signature,
   source='AUTO_ROUTING',
   route_count=excluded.route_count,
   is_active=true,
   updated_at=now()
 `,[runId]);

 if(run.mode==="FULL"){
  // Children are not read unless their segment is active. Replacing all AUTO
  // children inside this transaction keeps the old generation visible until commit.
  await c.query(`
   delete from md_intermediate_bridge_operation o
   using md_intermediate_bridge_segment s
   where s.id=o.segment_id and s.source='AUTO_ROUTING'
  `);
  await c.query(`
   delete from md_intermediate_bridge_route r
   using md_intermediate_bridge_segment s
   where s.id=r.segment_id and s.source='AUTO_ROUTING'
  `);
  await c.query(`
   update md_intermediate_bridge_segment s
      set is_active=false,route_count=0,updated_at=now()
    where s.source='AUTO_ROUTING'
      and not exists(
       select 1 from md_intermediate_bridge_stage_segment st
       where st.run_id=$1 and st.bridge_key=s.bridge_key
      )
  `,[runId]);
 }else{
  // Remove only evidence belonging to changed/inactive routing codes. A code
  // may no longer exist in md_st_routing; it is still present in the run list.
  await c.query(`
   delete from md_intermediate_bridge_route r
   using md_intermediate_bridge_segment s
   where s.id=r.segment_id and s.source='AUTO_ROUTING'
     and exists(
      select 1 from md_intermediate_bridge_rebuild_route rr
      where rr.run_id=$1 and rr.routing_code=r.routing_code
     )
  `,[runId]);

  // Operation sequence is signature-defined. Refresh only staged segments.
  await c.query(`
   delete from md_intermediate_bridge_operation o
   using md_intermediate_bridge_segment s
   where s.id=o.segment_id and s.source='AUTO_ROUTING'
     and exists(
      select 1 from md_intermediate_bridge_stage_segment st
      where st.run_id=$1 and st.bridge_key=s.bridge_key
     )
  `,[runId]);
 }

 await c.query(`
  insert into md_intermediate_bridge_operation(segment_id,sequence_no,operation_code)
  select s.id,st.sequence_no,st.operation_code
  from md_intermediate_bridge_stage_operation st
  join md_intermediate_bridge_segment s on s.bridge_key=st.bridge_key
  where st.run_id=$1
  on conflict(segment_id,sequence_no) do update set operation_code=excluded.operation_code
 `,[runId]);
 await c.query(`
  insert into md_intermediate_bridge_route(segment_id,routing_code,previous_main_seq,next_main_seq)
  select s.id,st.routing_code,st.previous_main_seq,st.next_main_seq
  from md_intermediate_bridge_stage_route st
  join md_intermediate_bridge_segment s on s.bridge_key=st.bridge_key
  where st.run_id=$1
  on conflict do nothing
 `,[runId]);

 if(run.mode==="INCREMENTAL"){
  // Recompute counts from actual evidence because unaffected routing evidence
  // remains in place during an incremental publish.
  await c.query(`
   update md_intermediate_bridge_segment s
      set route_count=x.route_count,
          is_active=(x.route_count>0),
          updated_at=now()
     from (
      select s2.id,count(r.id)::int route_count
      from md_intermediate_bridge_segment s2
      left join md_intermediate_bridge_route r on r.segment_id=s2.id
      where s2.source='AUTO_ROUTING'
      group by s2.id
     ) x
    where s.id=x.id
  `);
 }

 const totals=await c.query(`
  select
   count(*) filter(where is_active=true and source='AUTO_ROUTING')::int segments,
   coalesce(sum(route_count) filter(where is_active=true and source='AUTO_ROUTING'),0)::int route_rows,
   (select count(*)::int from md_intermediate_bridge_operation o join md_intermediate_bridge_segment s on s.id=o.segment_id where s.is_active=true and s.source='AUTO_ROUTING') operation_rows
  from md_intermediate_bridge_segment
 `);
 // Staging is no longer needed after a successful atomic publish. Keep only
 // the lightweight run header for audit/status history.
 await c.query(`delete from md_intermediate_bridge_rebuild_route where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_route where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_operation where run_id=$1`,[runId]);
 await c.query(`delete from md_intermediate_bridge_stage_segment where run_id=$1`,[runId]);

 const done=await c.query(`
  update md_intermediate_bridge_rebuild_run
     set status='COMPLETED',completed_at=now(),updated_at=now(),error_message=null
   where run_id=$1
   returning *
 `,[runId]);
 return {
  run:asRun(done.rows[0]),published:true,
  segments:Number(totals.rows[0]?.segments||0),
  routeRows:Number(totals.rows[0]?.route_rows||0),
  operationRows:Number(totals.rows[0]?.operation_rows||0)
 };
}

export type IntermediateBridgeRule={
 segmentId:number;
 previousMainOperation:string;
 nextMainOperation:string;
 intermediateOperations:string[];
 source:"AUTO_ROUTING"|"MANUAL";
 routeCount:number;
 priority:number;
 note:string|null;
};

/**
 * Canonical ACTIVE Bridge snapshot used by Planning Chain positioning.
 * MANUAL rules override AUTO_ROUTING rules; higher MANUAL priority wins.
 *
 * IMPORTANT v308:
 * - All Open Job physical position is resolved ONLY by the exact
 *   LastLaborOp + NextOperation pair.
 * - This loader returns the whole ordered intermediate sequence of each
 *   Segment, not one row per operation code.
 * - MANUAL and AUTO_ROUTING share one data model; Auto rebuild never mutates
 *   MANUAL rows.
 * - Schedule/Batch history is NOT used to choose a Segment. It is applied only
 *   after the physical position has been resolved.
 */
export async function loadIntermediateBridgeRules(c:PoolClient):Promise<IntermediateBridgeRule[]>{
 const q=await c.query(`
  select
   s.id segment_id,
   upper(trim(s.previous_main_operation)) previous_main_operation,
   upper(trim(s.next_main_operation)) next_main_operation,
   coalesce(
     jsonb_agg(upper(trim(o.operation_code)) order by o.sequence_no)
       filter(where o.id is not null),
     '[]'::jsonb
   ) intermediate_operations,
   s.source,
   s.route_count,
   coalesce(s.priority,100)::int priority,
   s.note
  from md_intermediate_bridge_segment s
  left join md_intermediate_bridge_operation o on o.segment_id=s.id
  where s.is_active=true and s.source in ('MANUAL','AUTO_ROUTING')
  group by s.id,s.previous_main_operation,s.next_main_operation,s.source,s.route_count,s.priority,s.note
  order by case when s.source='MANUAL' then 0 else 1 end,coalesce(s.priority,100) desc,s.route_count desc,s.id
 `);
 return q.rows.map((r:any)=>({
  segmentId:Number(r.segment_id),
  previousMainOperation:clean(r.previous_main_operation),
  nextMainOperation:clean(r.next_main_operation),
  intermediateOperations:Array.isArray(r.intermediate_operations)
   ?r.intermediate_operations.map((x:unknown)=>clean(x)).filter(Boolean)
   :[],
  source:String(r.source)==="MANUAL"?"MANUAL":"AUTO_ROUTING",
  routeCount:Number(r.route_count||0),
  priority:Number(r.priority||100),
  note:r.note==null?null:String(r.note).trim()
 }));
}
