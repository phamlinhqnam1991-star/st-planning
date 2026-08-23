import type {PoolClient} from "pg";

type Mapping={
 source_operation_code:string;
 st_group:string;
 standard_operation_rule:string;
 mapping_rule:string;
 sort_order:number;
};

type RawPlanningOp={
 sourceSeq:number;
 sourceCode:string;
 standardOperation:string;
 stGroup:string;
 occurrence:number;
 instanceKey:string;
};

const PLANNING_SCOPE=new Set([
 "CMSA","CHEMMILL","CPBILP","CPBILP-A","RWK","V_A-SHPN","MANUALSP",
 "CLASP","BSAUNSLD","TSAUNSLD","BSASLD","TSASLD","CCNV-IM","CCNV-IA",
 "V_PASS/BRTG","FMSKG-CM","SIPC","SI-SEAL","STRIP",
 "HE-BAKE after plating","HE-BAKE before blasting",
 "A-DBLST","M-DBLST","PLA-ZiNi","HE-BAKE","PLA-CC",
 "PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2",
 "ANTI-ABRASION","PAINT MARKING","VARNISH"
]);

const clean=(v:unknown)=>String(v??"").trim();

function splitAllOperation(v:unknown){
 const x=clean(v)
  .replace(/^\[/,"")
  .replace(/\]$/,"")
  .trim();

 if(!x)return [];

 return x
  .split(/\s*\|\s*/)
  .map(s=>s.replace(/^\[/,"").replace(/\]$/,"").trim())
  .filter(Boolean);
}

type PlanningAnchor={
 startIndex:number;
 mode:"NEXT_OPERATION"|"LAST_OPERATION_FALLBACK"|"SEQUENCE_CHECK";
 reason:string;
};

function currentAnchor(
 raw:string[],
 lastOperation:string,
 nextOperation:string
):PlanningAnchor{
 const upper=raw.map(x=>x.toUpperCase());
 const next=(nextOperation||"").trim().toUpperCase();
 const last=(lastOperation||"").trim().toUpperCase();

 // 1) NEXT OPERATION is always the primary current-position marker.
 // Start Planning from the exact NextOperation position.
 if(next){
   const nextIndexes:number[]=[];
   for(let i=0;i<upper.length;i++){
     if(upper[i]===next)nextIndexes.push(i);
   }

   if(nextIndexes.length){
     let nextIndex=nextIndexes[0];

     // If the same operation code occurs more than once in AllOperation,
     // LastLaborOp is used ONLY to disambiguate which occurrence of
     // NextOperation is current. NextOperation is still the anchor.
     if(nextIndexes.length>1 && last){
       let lastIndex=-1;
       for(let i=upper.length-1;i>=0;i--){
         if(upper[i]===last){
           lastIndex=i;
           break;
         }
       }
       const afterLast=nextIndexes.find(i=>i>lastIndex);
       if(afterLast!==undefined)nextIndex=afterLast;
     }

     return {
       startIndex:nextIndex,
       mode:"NEXT_OPERATION",
       reason:`NextOperation ${nextOperation} found at AllOperation position ${nextIndex+1}`
     };
   }
 }

 // 2) Only when NextOperation cannot be found, fallback to LastLaborOp.
 // Start from the operation immediately AFTER LastLaborOp.
 if(last){
   let lastIndex=-1;
   for(let i=upper.length-1;i>=0;i--){
     if(upper[i]===last){
       lastIndex=i;
       break;
     }
   }

   if(lastIndex>=0){
     return {
       startIndex:lastIndex+1,
       mode:"LAST_OPERATION_FALLBACK",
       reason:next
         ? `NextOperation ${nextOperation} not found; fallback after LastLaborOp ${lastOperation}`
         : `NextOperation blank; fallback after LastLaborOp ${lastOperation}`
     };
   }
 }

 // 3) If neither position can be resolved, DO NOT guess from the first operation.
 return {
   startIndex:-1,
   mode:"SEQUENCE_CHECK",
   reason:next
     ? `NextOperation ${nextOperation} not found and LastLaborOp ${lastOperation||"(blank)"} cannot be resolved`
     : `NextOperation and LastLaborOp cannot be resolved`
 };
}

function standardize(
 raw:string[],
 mappingBySource:Map<string,Mapping[]>
):RawPlanningOp[]{
 const primerCodes=new Set<string>();
 const topcoatCodes=new Set<string>();

 for(const [code,maps] of mappingBySource){
   if(maps.some(m=>m.st_group==="PRIMER"))primerCodes.add(code);
   if(maps.some(m=>m.st_group==="TOPCOAT"))topcoatCodes.add(code);
 }

 let primerOccurrence=0;
 let topcoatOccurrence=0;
 const stdOccurrence=new Map<string,number>();
 const result:RawPlanningOp[]=[];

 for(let i=0;i<raw.length;i++){
   const sourceCode=raw[i];
   const key=sourceCode.toUpperCase();
   const maps=mappingBySource.get(key)||[];
   if(!maps.length)continue;

   let standardOperation="";
   let stGroup=maps[0].st_group;

   if(primerCodes.has(key)){
     primerOccurrence++;
     standardOperation=
       primerOccurrence===1?"PRIMER":
       primerOccurrence===2?"PRIMER2":"PRIMER3";
     stGroup="PRIMER";
   }else if(topcoatCodes.has(key)){
     topcoatOccurrence++;
     standardOperation=topcoatOccurrence===1?"TOPCOAT1":"TOPCOAT2";
     stGroup="TOPCOAT";
   }else if(key==="HE-BAKE"){
     const prev=(raw[i-1]||"").toUpperCase();
     const next=(raw[i+1]||"").toUpperCase();

     if(prev==="PLA-ZINI" || next==="PLA-CC")
       standardOperation="HE-BAKE after plating";
     else if(next==="A-DBLST" || next==="M-DBLST")
       standardOperation="HE-BAKE before blasting";
     else
       standardOperation="HE-BAKE";

     stGroup="HE-BAKE";
   }else{
     const direct=
       maps.find(m=>m.mapping_rule==="DIRECT") ||
       maps.find(m=>m.mapping_rule==="SEQUENCE/FALLBACK") ||
       maps[0];

     standardOperation=direct.standard_operation_rule;
     stGroup=direct.st_group;
   }

   if(!PLANNING_SCOPE.has(standardOperation))continue;

   const occ=(stdOccurrence.get(standardOperation)||0)+1;
   stdOccurrence.set(standardOperation,occ);

   result.push({
     sourceSeq:i+1,
     sourceCode,
     standardOperation,
     stGroup,
     occurrence:occ,
     instanceKey:`${standardOperation}#${occ}`
   });
 }

 return result;
}

/**
 * Planning only works with MAIN operations that survive standardize()
 * and belong to PLANNING_SCOPE.
 *
 * NextOperation is still the actual shop-floor position marker, even when it
 * is an intermediate operation such as MASKING / UNMASKING / inspection /
 * preparation or any other non-planning operation.
 *
 * Rule:
 * - if NextOperation itself is a main Planning operation -> use it;
 * - if NextOperation is an intermediate operation -> skip forward to the
 *   nearest main Planning operation in AllOperation;
 * - never jump backward to a previous main operation;
 * - if there is no later main Planning operation -> no Candidate is created.
 */
function planningChainFromAnchor(
 full:RawPlanningOp[],
 anchor:PlanningAnchor
):RawPlanningOp[]{
 if(anchor.startIndex<0)return [];

 // sourceSeq is 1-based, startIndex is 0-based.
 // For NEXT_OPERATION this includes the exact operation when it is a main op.
 // For an intermediate operation there is no matching item in `full`, so the
 // first returned item is automatically the nearest following main operation.
 const minimumSourceSeq=anchor.startIndex+1;

 return full.filter(op=>op.sourceSeq>=minimumSourceSeq);
}

export async function syncPlanningChains(c:PoolClient){
 const [mappingQ,jobsQ,paintQ,chemicalQ,existingQ,batchHistoryQ]=await Promise.all([
   c.query(`
     select source_operation_code,st_group,standard_operation_rule,mapping_rule,sort_order
     from md_st_operation_mapping
     where is_active=true
     order by source_operation_code,sort_order
   `),
   c.query(`
     select job_num,part_num,revision_num,last_operation,next_operation,all_operation
     from open_job_current
     where is_open=true
     order by job_num
   `),
   c.query(`
     select part_num,revision_num,standard_operation,recipe_key
     from md_part_process_recipe
     where is_active=true
   `),
   c.query(`
     select operation_code,recipe_key
     from md_operation_code_recipe
     where is_active=true
     order by operation_code,priority,is_default desc,updated_at desc
   `),
   c.query(`
     select job_num,operation_instance_key,status,recipe_key
     from planning_job_operation
     where is_active=true
   `),
   c.query(`
     select
       bj.job_num,
       bj.operation_instance_key_snapshot,
       bj.standard_operation,
       bj.source_seq_snapshot,
       b.status batch_status
     from planning_batch_job bj
     join planning_batch b
       on b.id=bj.batch_id
      and b.status<>'CANCELLED'
   `)
 ]);

 const mappingBySource=new Map<string,Mapping[]>();
 for(const r of mappingQ.rows){
   const k=clean(r.source_operation_code).toUpperCase();
   const arr=mappingBySource.get(k)||[];
   arr.push(r as Mapping);
   mappingBySource.set(k,arr);
 }

 const paintRecipes=new Map<string,string>();
 for(const r of paintQ.rows){
   paintRecipes.set(
     `${clean(r.part_num)}\u0001${clean(r.revision_num)}\u0001${clean(r.standard_operation)}`,
     clean(r.recipe_key)
   );
 }

 const chemicalLists=new Map<string,string[]>();
 for(const r of chemicalQ.rows){
   const k=clean(r.operation_code).toUpperCase();
   const arr=chemicalLists.get(k)||[];
   arr.push(clean(r.recipe_key));
   chemicalLists.set(k,arr);
 }

 const existingByJob=new Map<string,Map<string,{status:string;recipeKey:string|null}>>();
 for(const r of existingQ.rows){
   const job=clean(r.job_num);
   const map=existingByJob.get(job)||new Map();
   map.set(clean(r.operation_instance_key),{
     status:clean(r.status),
     recipeKey:r.recipe_key?clean(r.recipe_key):null
   });
   existingByJob.set(job,map);
 }

 // Durable PLANNED history from actual Batch membership.
 // IMPORTANT: PLANNED is validated by the exact Job + Standard Operation +
 // original source sequence. We intentionally do NOT trust a stale
 // planning_job_operation.status='PLANNED' by itself.
 //
 // This prevents a CPBILP Batch from accidentally marking BSAUNSLD as PLANNED.
 const plannedHistoryExactByJob=new Map<string,Set<string>>();

 for(const r of batchHistoryQ.rows){
   const job=clean(r.job_num);
   const std=clean(r.standard_operation);
   const sourceSeq=Number(r.source_seq_snapshot);

   if(std && Number.isFinite(sourceSeq)){
     const set=plannedHistoryExactByJob.get(job)||new Set<string>();
     set.add(`${std}\u0001${sourceSeq}`);
     plannedHistoryExactByJob.set(job,set);
   }
 }

 let jobs=0;
 let operations=0;
 let eligible=0;
 let locked=0;
 let preservedPlanned=0;
 let nextAnchored=0;
 let fallbackAnchored=0;
 let sequenceCheck=0;

 // Rebuild only future/unplanned chain rows. Planned rows are preserved as history/state.
 await c.query(`
   update planning_job_operation
   set is_active=false,updated_at=now()
   where status<>'PLANNED' and is_active=true
 `);

 // PIONBL is intentionally skipped from Planning.
 // Deactivate old chain rows too; Batch history remains intact because
 // planning_batch_job still references the historical operation row.
 await c.query(`
   update planning_job_operation
   set is_active=false,updated_at=now()
   where standard_operation='PIONBL'
     and is_active=true
 `);

 const rows:any[][]=[];

 for(const job of jobsQ.rows){
   jobs++;

   const raw=splitAllOperation(job.all_operation);
   const anchor=currentAnchor(
     raw,
     clean(job.last_operation),
     clean(job.next_operation)
   );

   // IMPORTANT:
   // Standardize the FULL AllOperation first so PRIMER/TOPCOAT occurrence
   // remains correct even when Planning starts in the middle of the routing.
   const full=standardize(raw,mappingBySource);

   if(anchor.mode==="NEXT_OPERATION")nextAnchored++;
   else if(anchor.mode==="LAST_OPERATION_FALLBACK")fallbackAnchored++;
   else sequenceCheck++;

   // MAIN-OPERATION CANDIDATE RULE:
   // NextOperation may be MASKING / UNMASKING / another intermediate step.
   // `full` contains only Planning Scope operations, therefore the first row
   // at/after the raw NextOperation position is the nearest MAIN operation
   // forward in the routing.
   //
   // Example:
   // CPBILP -> MASKING -> UNMASKING -> BSAUNSLD -> PRIMER
   // NextOperation=MASKING   => BSAUNSLD is the first Planning Candidate
   // NextOperation=UNMASKING => BSAUNSLD is the first Planning Candidate
   // NextOperation=BSAUNSLD  => BSAUNSLD itself is the first Candidate
   //
   // SEQUENCE_CHECK still produces no Candidate when current position cannot
   // be resolved from AllOperation.
   const chain=planningChainFromAnchor(full,anchor);

   const jobNum=clean(job.job_num);
   const existing=existingByJob.get(jobNum)||new Map();
   const plannedHistoryExact=plannedHistoryExactByJob.get(jobNum)||new Set<string>();
   const activeKeys:string[]=[];

   // PLAN-AHEAD STATUS RULE (applies to every Planning Operation):
   // 1. A row already in a non-cancelled Batch is PLANNED, even after rebuild.
   // 2. The actual-ready first future Planning Operation is ELIGIBLE.
   // 3. Any later operation becomes ELIGIBLE only when its immediately
   //    previous Planning Operation is PLANNED.
   // 4. Otherwise it remains LOCKED.
   //
   // This means:
   // CPBILP PLANNED -> BSAUNSLD ELIGIBLE
   // BSAUNSLD PLANNED -> PRIMER ELIGIBLE
   // ...without waiting for All Open Job.NextOperation to advance.
   let previousPlanningIsPlanned=false;

   for(let i=0;i<chain.length;i++){
     const op=chain[i];
     activeKeys.push(op.instanceKey);

     const old=existing.get(op.instanceKey);

     // Exact current-operation Batch membership only.
     const historicalPlanned=
       plannedHistoryExact.has(`${op.standardOperation}\u0001${op.sourceSeq}`);

     let status:string;

     if(historicalPlanned){
       status="PLANNED";
       previousPlanningIsPlanned=true;
       preservedPlanned++;
     }else if(i===0){
       // First Planning operation at/after the actual All Open Job anchor.
       status="ELIGIBLE";
       previousPlanningIsPlanned=false;
       eligible++;
     }else if(previousPlanningIsPlanned){
       // Plan-ahead: previous Planning operation is already in a Batch.
       status="ELIGIBLE";
       previousPlanningIsPlanned=false;
       eligible++;
     }else{
       status="LOCKED";
       previousPlanningIsPlanned=false;
       locked++;
     }

     let recipeKey:string|null=null;

     if(
       ["PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI-ABRASION","VARNISH"]
       .includes(op.standardOperation)
     ){
       recipeKey=paintRecipes.get(
         `${clean(job.part_num)}\u0001${clean(job.revision_num)}\u0001${op.standardOperation}`
       )||null;
     }else{
       const list=chemicalLists.get(op.sourceCode.toUpperCase())||[];
       recipeKey=list.length===1?list[0]:null;
     }

     // Preserve the previously selected Recipe only when this exact operation
     // is confirmed by Batch history as PLANNED.
     if(historicalPlanned && old?.recipeKey)
       recipeKey=old.recipeKey;

     // Previous Planning Operation comes from the FULL standardized route,
     // not only the current/future chain. Therefore a Candidate can still
     // show CPBILP before BSAUNSLD after All Open Job has advanced.
     const fullIndex=full.findIndex(x=>x.instanceKey===op.instanceKey);
     const previousFull=fullIndex>0?full[fullIndex-1]:null;

     rows.push([
       job.job_num,op.instanceKey,op.sourceSeq,i+1,
       op.sourceCode,op.standardOperation,op.stGroup,
       previousFull?.standardOperation||null,
       previousFull?.sourceCode||null,
       previousFull?.sourceSeq||null,
       recipeKey,status,true,new Date()
     ]);

     operations++;
   }

 }

 // Bulk upsert.
 const cols=[
   "job_num","operation_instance_key","source_seq","planning_seq",
   "source_operation_code","standard_operation","st_group",
   "previous_standard_operation_snapshot",
   "previous_source_operation_code_snapshot",
   "previous_source_seq_snapshot",
   "recipe_key","status","is_active","updated_at"
 ];

 const chunkSize=1000;
 for(let offset=0;offset<rows.length;offset+=chunkSize){
   const chunk=rows.slice(offset,offset+chunkSize);
   const params:any[]=[];
   let n=1;
   const values=chunk.map(r=>`(${r.map(v=>{params.push(v);return `$${n++}`}).join(",")})`).join(",");

   await c.query(`
     insert into planning_job_operation(${cols.join(",")})
     values ${values}
     on conflict(job_num,operation_instance_key)
     do update set
       source_seq=excluded.source_seq,
       planning_seq=excluded.planning_seq,
       source_operation_code=excluded.source_operation_code,
       standard_operation=excluded.standard_operation,
       st_group=excluded.st_group,
       previous_standard_operation_snapshot=excluded.previous_standard_operation_snapshot,
       previous_source_operation_code_snapshot=excluded.previous_source_operation_code_snapshot,
       previous_source_seq_snapshot=excluded.previous_source_seq_snapshot,
       recipe_key=excluded.recipe_key,
       status=excluded.status,
       is_active=true,
       updated_at=now()
   `,params);
 }


 await c.query(`
   update planning_job_operation p
   set is_active=false,updated_at=now()
   where is_active=true
     and exists(
       select 1 from open_job_current j
       where j.job_num=p.job_num and not j.is_open
     )
 `);

 return {jobs,operations,eligible,locked,preservedPlanned,nextAnchored,fallbackAnchored,sequenceCheck};
}
