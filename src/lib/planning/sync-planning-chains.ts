import type {PoolClient} from "pg";
import {pickBestRecipeForJob,type RecipeCandidateItem} from "@/lib/batch-key-recipe";
import {loadIntermediateBridgeRules,type IntermediateBridgeRule} from "@/lib/planning/intermediate-bridge-segments";

type Mapping={
 id:number;
 source_operation_code:string;
 st_group:string;
 standard_operation_rule:string;
 mapping_rule:string;
 sort_order:number;
 created_at:string|null;
 updated_at:string|null;
};

type RawPlanningOp={
 sourceSeq:number;
 planningSeq:number;
 sourceCode:string;
 standardOperation:string;
 stGroup:string;
 occurrence:number;
 instanceKey:string;
};

// Planning scope is dynamic and loaded from md_planning_operation_scope.


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
 mode:"BRIDGE_PAIR"|"ALLOPERATION_FALLBACK"|"DIRECT_NEXT_MAIN"|"NO_CHAIN";
 reason:string;
 targetInstanceKey?:string|null;
 requiredPreviousInstanceKey?:string|null;
};

const normCode=(v:unknown)=>clean(v).toUpperCase();

/**
 * v313 canonical physical-position rule.
 *
 * The primary All Open Job position fields remain:
 *   LastLaborOp + NextOperation
 *
 * Resolver order:
 *   1) ACTIVE Intermediate Bridge Segment (MANUAL > AUTO_ROUTING)
 *   2) AllOperation fallback -> nearest UPCOMING Main Planning occurrence
 *   3) If the result would be NO_CHAIN but NextOperation itself is a live
 *      Main Planning occurrence, NextOperation is Current Main.
 *   4) Next Main(s) are the following Main Planning occurrences from this
 *      same Job's AllOperation-derived canonical route.
 *   5) NO CHAIN only when no unique Current Main can still be resolved.
 *
 * Schedule/Batch history never chooses the physical position. It is applied
 * only after the Current Main + Next Main(s) have been located.
 */

/**
 * Resolve a pair that lives inside an ACTIVE Intermediate Bridge Segment.
 * MANUAL rules override AUTO_ROUTING rules.
 *
 * For every canonical consecutive Main pair in this Job we reconstruct the
 * physical bridge sequence using RAW source codes at the boundaries:
 *
 *   PreviousMain.sourceCode -> intermediate[] -> NextMain.sourceCode
 *
 * Then LastLaborOp + NextOperation must match one exact adjacent pair in that
 * sequence. Batch/Schedule history is deliberately NOT consulted here.
 *
 * null = no Segment matches the pair. NO_CHAIN = Segment(s) match but the
 * winning source/priority still cannot identify one canonical Main occurrence.
 */
function bridgePairAnchor(
 full:RawPlanningOp[],
 lastOperation:string,
 nextOperation:string,
 rules:IntermediateBridgeRule[]
):PlanningAnchor|null{
 const last=normCode(lastOperation);
 const next=normCode(nextOperation);
 if(!last||!next)return null;

 type Match={previous:RawPlanningOp;target:RawPlanningOp;rule:IntermediateBridgeRule};
 const matches:Match[]=[];

 for(const rule of rules){
  const previousMain=normCode(rule.previousMainOperation);
  const nextMain=normCode(rule.nextMainOperation);
  if(!previousMain||!nextMain)continue;

  for(let i=0;i<full.length-1;i++){
   const previous=full[i];
   const target=full[i+1];
   if(normCode(previous.standardOperation)!==previousMain)continue;
   if(normCode(target.standardOperation)!==nextMain)continue;

   const physical=[
    normCode(previous.sourceCode),
    ...rule.intermediateOperations.map(normCode),
    normCode(target.sourceCode)
   ].filter(Boolean);

   let pairFound=false;
   for(let k=0;k<physical.length-1;k++){
    if(physical[k]===last&&physical[k+1]===next){
     pairFound=true;
     break;
    }
   }
   if(pairFound)matches.push({previous,target,rule});
  }
 }

 if(!matches.length)return null;

 // MANUAL > AUTO_ROUTING. Within MANUAL, higher priority wins.
 const sourceRank=(x:Match)=>x.rule.source==="MANUAL"?2:1;
 const maxSourceRank=Math.max(...matches.map(sourceRank));
 let winners=matches.filter(x=>sourceRank(x)===maxSourceRank);
 if(maxSourceRank===2){
  const maxPriority=Math.max(...winners.map(x=>Number(x.rule.priority||0)));
  winners=winners.filter(x=>Number(x.rule.priority||0)===maxPriority);
 }

 const byTarget=new Map<string,Match>();
 for(const match of winners){
  const key=`${match.previous.instanceKey}\u0001${match.target.instanceKey}`;
  if(!byTarget.has(key))byTarget.set(key,match);
 }

 if(byTarget.size===1){
  const best=[...byTarget.values()][0];
  const sourceLabel=best.rule.source==="MANUAL"
   ?`MANUAL priority ${best.rule.priority}`
   :"AUTO";
  return {
   startIndex:best.target.sourceSeq-1,
   mode:"BRIDGE_PAIR",
   targetInstanceKey:best.target.instanceKey,
   requiredPreviousInstanceKey:best.previous.instanceKey,
   reason:`Pair ${lastOperation} -> ${nextOperation} locates ${sourceLabel} Bridge ${best.previous.standardOperation} -> [${best.rule.intermediateOperations.join(" -> ")}] -> ${best.target.standardOperation}`
  };
 }

 return {
  startIndex:-1,
  mode:"NO_CHAIN",
  reason:`Pair ${lastOperation} -> ${nextOperation} matches ${byTarget.size} ${maxSourceRank===2?"MANUAL":"AUTO"} Main occurrences; Bridge result is ambiguous`
 };
}

/**
 * v311 AllOperation fallback.
 *
 * This runs ONLY when no ACTIVE Manual/Auto Segment matches the pair.
 * It still uses only LastLaborOp + NextOperation as physical-position input.
 * The nearest UPCOMING Planning Main is selected from this Job's own
 * AllOperation-derived canonical route.
 *
 * Resolution strength:
 *  1) exact adjacent LastLaborOp -> NextOperation in AllOperation;
 *  2) both codes exist in route -> nearest ordered Last/Next occurrence pair;
 *  3) if one code is absent from AllOperation, use the unique occurrence of the
 *     other member of the same All Open Job pair as the route anchor;
 *  4) if neither code exists in AllOperation but the canonical route still has
 *     Planning Mains, use the FIRST Main Planning occurrence as Current Main;
 *  5) ambiguous/no usable occurrence -> no fallback.
 *
 * No Schedule history is used to pick an occurrence.
 */
function allOperationFallbackAnchor(
 raw:string[],
 full:RawPlanningOp[],
 lastOperation:string,
 nextOperation:string
):PlanningAnchor|null{
 const last=normCode(lastOperation);
 const next=normCode(nextOperation);
 if(!last||!next||!raw.length||!full.length)return null;

 const upper=raw.map(normCode);
 const lastPositions:number[]=[];
 const nextPositions:number[]=[];
 for(let i=0;i<upper.length;i++){
  if(upper[i]===last)lastPositions.push(i);
  if(upper[i]===next)nextPositions.push(i);
 }

 type PositionCandidate={
  minSourceSeq:number;
  kind:"EXACT_PAIR"|"ORDERED_PAIR"|"NEXT_ONLY_IN_ALLOPERATION"|"LAST_ONLY_IN_ALLOPERATION";
  lastIndex:number|null;
  nextIndex:number|null;
 };
 let positionCandidates:PositionCandidate[]=[];

 // 1) Exact adjacent pair in AllOperation.
 for(const li of lastPositions){
  if(li+1<upper.length&&upper[li+1]===next){
   positionCandidates.push({
    minSourceSeq:li+2, // sourceSeq of NextOperation (1-based)
    kind:"EXACT_PAIR",
    lastIndex:li,
    nextIndex:li+1
   });
  }
 }

 // 2) Both codes exist but are not adjacent: use the nearest ordered pair.
 if(!positionCandidates.length&&lastPositions.length&&nextPositions.length){
  const ordered:{lastIndex:number;nextIndex:number;gap:number}[]=[];
  for(const li of lastPositions){
   for(const ni of nextPositions){
    if(ni>li)ordered.push({lastIndex:li,nextIndex:ni,gap:ni-li});
   }
  }
  if(ordered.length){
   const minGap=Math.min(...ordered.map(x=>x.gap));
   positionCandidates=ordered
    .filter(x=>x.gap===minGap)
    .map(x=>({
     minSourceSeq:x.nextIndex+1,
     kind:"ORDERED_PAIR" as const,
     lastIndex:x.lastIndex,
     nextIndex:x.nextIndex
    }));
  }
 }

 // 3) One member is not represented in AllOperation. This is common for an
 // Intermediate raw operation. Use the unique occurrence of the other member
 // of the SAME LastLaborOp + NextOperation pair; never use any other field.
 if(!positionCandidates.length){
  if(lastPositions.length===0&&nextPositions.length===1){
   const ni=nextPositions[0];
   positionCandidates=[{
    minSourceSeq:ni+1,
    kind:"NEXT_ONLY_IN_ALLOPERATION",
    lastIndex:null,
    nextIndex:ni
   }];
  }else if(nextPositions.length===0&&lastPositions.length===1){
   const li=lastPositions[0];
   positionCandidates=[{
    // LastLaborOp is already behind the physical cursor. Current Main must be
    // the first Planning Main strictly AFTER that source occurrence.
    minSourceSeq:li+2,
    kind:"LAST_ONLY_IN_ALLOPERATION",
    lastIndex:li,
    nextIndex:null
   }];
  }
 }

 // 4) Neither member of the All Open Job pair is represented in AllOperation.
 // The Job still has a valid canonical Planning route, so use the FIRST Main
 // Planning occurrence as Current Main. This is the final AllOperation fallback
 // before NO CHAIN and intentionally does not consult Schedule/Batch history.
 if(!positionCandidates.length&&lastPositions.length===0&&nextPositions.length===0){
  const firstMain=full[0]||null;
  if(firstMain){
   return {
    startIndex:firstMain.sourceSeq-1,
    mode:"ALLOPERATION_FALLBACK",
    targetInstanceKey:firstMain.instanceKey,
    requiredPreviousInstanceKey:null,
    reason:`No active Bridge matched ${lastOperation} -> ${nextOperation}; neither pair code exists in AllOperation, so fallback selects first Main Planning ${firstMain.standardOperation} (${firstMain.sourceCode})`
   };
  }
 }

 if(!positionCandidates.length)return null;

 type MainCandidate={
  target:RawPlanningOp;
  previous:RawPlanningOp|null;
  position:PositionCandidate;
 };
 const resolved:MainCandidate[]=[];

 for(const position of positionCandidates){
  const target=full.find(op=>op.sourceSeq>=position.minSourceSeq)||null;
  if(!target)continue;
  const targetIndex=full.findIndex(op=>op.instanceKey===target.instanceKey);
  const previous=targetIndex>0?full[targetIndex-1]:null;
  resolved.push({target,previous,position});
 }

 if(!resolved.length)return null;

 // Different raw occurrence candidates are acceptable only when they resolve
 // to the same canonical Current Main occurrence. Otherwise return no fallback
 // and let currentAnchor produce NO CHAIN instead of guessing.
 const byTarget=new Map<string,MainCandidate>();
 for(const candidate of resolved){
  if(!byTarget.has(candidate.target.instanceKey)){
   byTarget.set(candidate.target.instanceKey,candidate);
  }
 }
 if(byTarget.size!==1)return null;

 const best=[...byTarget.values()][0];
 const nextIsCurrentMain=
  best.position.nextIndex!==null &&
  best.target.sourceSeq===best.position.nextIndex+1 &&
  normCode(best.target.sourceCode)===next;

 const kindLabel={
  EXACT_PAIR:"exact pair",
  ORDERED_PAIR:"nearest ordered pair",
  NEXT_ONLY_IN_ALLOPERATION:"NextOperation occurrence",
  LAST_ONLY_IN_ALLOPERATION:"LastLaborOp occurrence"
 }[best.position.kind];

 return {
  startIndex:best.target.sourceSeq-1,
  mode:"ALLOPERATION_FALLBACK",
  targetInstanceKey:best.target.instanceKey,
  // If NextOperation itself is the Main source, that Main is physically READY.
  // Otherwise the Job is between Planning Mains and normal handoff still
  // requires the immediate Previous Main to have a real Schedule.
  requiredPreviousInstanceKey:nextIsCurrentMain?null:(best.previous?.instanceKey||null),
  reason:`No active Bridge matched ${lastOperation} -> ${nextOperation}; AllOperation ${kindLabel} locates nearest upcoming Main ${best.target.standardOperation} (${best.target.sourceCode})`
 };
}

/**
 * v313 final NO_CHAIN rescue.
 *
 * Business rule: when NextOperation itself is a Main Planning operation, it is
 * the Current Main even if the pair/Bridge resolver would otherwise return
 * NO_CHAIN. Once that Current Main occurrence is known, planningChainFromAnchor
 * keeps this occurrence and every following Main from the SAME Job AllOperation,
 * so Next Main Planning is derived from AllOperation automatically.
 *
 * We only accept a unique canonical occurrence. If the same raw source code is
 * repeated, LastLaborOp is used only to disambiguate the occurrence inside the
 * same AllOperation. We never guess between two remaining occurrences.
 */
function directNextMainAnchor(
 raw:string[],
 full:RawPlanningOp[],
 lastOperation:string,
 nextOperation:string
):PlanningAnchor|null{
 const next=normCode(nextOperation);
 if(!next||!full.length)return null;

 const directCandidates=full.filter(op=>normCode(op.sourceCode)===next);
 if(!directCandidates.length)return null;

 const makeAnchor=(target:RawPlanningOp,detail:string):PlanningAnchor=>({
  startIndex:target.sourceSeq-1,
  mode:"DIRECT_NEXT_MAIN",
  targetInstanceKey:target.instanceKey,
  requiredPreviousInstanceKey:null,
  reason:`NO_CHAIN rescue: NextOperation ${nextOperation} is Main Planning ${target.standardOperation} (${target.sourceCode}); ${detail}. Following Next Main(s) come from this Job AllOperation`
 });

 // Normal case: this Job has one canonical occurrence for NextOperation.
 if(directCandidates.length===1){
  return makeAnchor(directCandidates[0],"unique canonical Main occurrence selected as Current Main");
 }

 // Repeated raw operation: use the same physical pair only to identify WHICH
 // occurrence of NextOperation is current. This does not change Main mapping.
 const upper=raw.map(normCode);
 const last=normCode(lastOperation);
 const candidateBySourceSeq=new Map<number,RawPlanningOp>();
 for(const op of directCandidates)candidateBySourceSeq.set(op.sourceSeq,op);

 if(last){
  const exact:RawPlanningOp[]=[];
  for(let i=1;i<upper.length;i++){
   if(upper[i]!==next||upper[i-1]!==last)continue;
   const candidate=candidateBySourceSeq.get(i+1);
   if(candidate)exact.push(candidate);
  }
  const exactByInstance=new Map<string,RawPlanningOp>();
  for(const candidate of exact)exactByInstance.set(candidate.instanceKey,candidate);
  const exactUnique=[...exactByInstance.values()];
  if(exactUnique.length===1){
   return makeAnchor(exactUnique[0],`exact AllOperation pair ${lastOperation} -> ${nextOperation} identifies the repeated occurrence`);
  }

  // If not adjacent, use the nearest ordered LastLaborOp -> NextOperation pair.
  // This mirrors the existing AllOperation fallback but the target MUST remain
  // the NextOperation Main itself.
  const lastPositions:number[]=[];
  const nextPositions:number[]=[];
  for(let i=0;i<upper.length;i++){
   if(upper[i]===last)lastPositions.push(i);
   if(upper[i]===next&&candidateBySourceSeq.has(i+1))nextPositions.push(i);
  }

  const ordered:{lastIndex:number;nextIndex:number;gap:number}[]=[];
  for(const li of lastPositions){
   for(const ni of nextPositions){
    if(ni>li)ordered.push({lastIndex:li,nextIndex:ni,gap:ni-li});
   }
  }
  if(ordered.length){
   const minGap=Math.min(...ordered.map(x=>x.gap));
   const nearest=ordered.filter(x=>x.gap===minGap);
   const resolvedByInstance=new Map<string,RawPlanningOp>();
   for(const pair of nearest){
    const candidate=candidateBySourceSeq.get(pair.nextIndex+1);
    if(candidate)resolvedByInstance.set(candidate.instanceKey,candidate);
   }
   const resolved=[...resolvedByInstance.values()];
   if(resolved.length===1){
    return makeAnchor(resolved[0],`nearest ordered AllOperation pair ${lastOperation} -> ${nextOperation} identifies the repeated occurrence`);
   }
  }
 }

 return null;
}

function currentAnchor(
 raw:string[],
 full:RawPlanningOp[],
 lastOperation:string,
 nextOperation:string,
 bridgeRules:IntermediateBridgeRule[]
):PlanningAnchor{
 const last=clean(lastOperation);
 const next=clean(nextOperation);
 if(!next){
  return {
   startIndex:-1,
   mode:"NO_CHAIN",
   reason:`NO CHAIN: NextOperation is blank`
  };
 }

 // v313: LastLaborOp may be incomplete/stale while NextOperation itself is an
 // unambiguous Main Planning occurrence. The agreed rule still makes that Main
 // the Current Main and lets AllOperation provide all following Next Main(s).
 if(!last){
  const directNextMain=directNextMainAnchor(raw,full,last,next);
  if(directNextMain)return directNextMain;
  return {
   startIndex:-1,
   mode:"NO_CHAIN",
   reason:`NO CHAIN: LastLaborOp is blank and NextOperation ${next} is not one unique Main Planning occurrence`
  };
 }

 // Existing resolver remains authoritative. A matched-but-ambiguous Bridge
 // still blocks the generic AllOperation fallback exactly as before v313. The
 // ONLY new override is the agreed direct NextOperation-is-Main rescue.
 const bridgeAnchor=bridgePairAnchor(full,last,next,bridgeRules);
 if(bridgeAnchor){
  if(bridgeAnchor.mode!=="NO_CHAIN")return bridgeAnchor;
  const directNextMain=directNextMainAnchor(raw,full,last,next);
  return directNextMain||bridgeAnchor;
 }

 // No Segment matched -> inspect this Job's own AllOperation and select the
 // nearest upcoming Main Planning occurrence.
 const allOperationAnchor=allOperationFallbackAnchor(raw,full,last,next);
 if(allOperationAnchor)return allOperationAnchor;

 // v313: only at the point we would return NO_CHAIN, apply the agreed fallback:
 // if NextOperation itself is Main Planning, that exact Main is Current Main.
 // planningChainFromAnchor(full, ...) then derives every Next Main from
 // AllOperation, preserving the canonical source occurrence/order.
 const directNextMain=directNextMainAnchor(raw,full,last,next);
 if(directNextMain)return directNextMain;

 return {
  startIndex:-1,
  mode:"NO_CHAIN",
  reason:`NO CHAIN: ${last} -> ${next} is not resolved by an active Manual/Auto Segment, AllOperation fallback, or the direct NextOperation Main rule`
 };
}

function standardize(
 raw:string[],
 mappingBySource:Map<string,Mapping>,
 planningScope:Set<string>
):RawPlanningOp[]{
 const primerCodes=new Set<string>();
 const topcoatCodes=new Set<string>();

 for(const [code,mapping] of mappingBySource){
   if(mapping.st_group==="PRIMER")primerCodes.add(code);
   if(mapping.st_group==="TOPCOAT")topcoatCodes.add(code);
 }

 let primerOccurrence=0;
 let topcoatOccurrence=0;
 const stdOccurrence=new Map<string,number>();
 const seenSourceOccurrence=new Set<string>();
 const result:RawPlanningOp[]=[];

 for(let i=0;i<raw.length;i++){
   const sourceCode=clean(raw[i]);
   const key=sourceCode.toUpperCase();
   const sourceSeq=i+1;
   if(!sourceCode)continue;

   // PIONBL remains in AllOperation/source trace but is never a Main Planning row.
   if(key==="PIONBL")continue;

   const mapping=mappingBySource.get(key);
   if(!mapping)continue;

   // Guard against an accidental duplicate of the same ORIGINAL source
   // occurrence. Do not dedupe by Standard Operation: the same Main may
   // legitimately appear again later in one route.
   const sourceOccurrenceKey=`${sourceSeq}|${key}`;
   if(seenSourceOccurrence.has(sourceOccurrenceKey))continue;
   seenSourceOccurrence.add(sourceOccurrenceKey);

   let standardOperation="";
   let stGroup=mapping.st_group;

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
     const prev=clean(raw[i-1]).toUpperCase();
     const next=clean(raw[i+1]).toUpperCase();

     if(prev==="PLA-ZINI" || next==="PLA-CC")
       standardOperation="HE-BAKE after plating";
     else if(next==="A-DBLST" || next==="M-DBLST")
       standardOperation="HE-BAKE before blasting";
     else
       standardOperation="HE-BAKE";

     stGroup="HE-BAKE";
   }else{
     standardOperation=mapping.standard_operation_rule;
     stGroup=mapping.st_group;
   }

   if(!planningScope.has(standardOperation))continue;

   const occ=(stdOccurrence.get(standardOperation)||0)+1;
   stdOccurrence.set(standardOperation,occ);

   // planningSeq is assigned only AFTER standardize + scope filter + dedupe,
   // but it remains the ordinal in the FULL Planning route, not the current
   // suffix from NextOperation. This keeps history/predecessor identity stable.
   result.push({
     sourceSeq,
     planningSeq:result.length+1,
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
 * and belong to the active md_planning_operation_scope.
 *
 * v313: The chain suffix is anchored after LastLaborOp + NextOperation
 * has been resolved by an ACTIVE Manual/Auto Bridge, by the AllOperation
 * fallback, or by the final direct NextOperation-is-Main rule. NO_CHAIN produces
 * no live rows only after all three routes fail.
 */
function planningChainFromAnchor(
 full:RawPlanningOp[],
 anchor:PlanningAnchor
):RawPlanningOp[]{
 if(anchor.startIndex<0)return [];

 if(anchor.targetInstanceKey){
   const index=full.findIndex(x=>x.instanceKey===anchor.targetInstanceKey);
   return index>=0?full.slice(index):[];
 }

 // sourceSeq is 1-based, startIndex is 0-based.
 const minimumSourceSeq=anchor.startIndex+1;
 return full.filter(op=>op.sourceSeq>=minimumSourceSeq);
}

export async function syncPlanningChains(c:PoolClient){
 // v298: Planning Chain consumes the last COMPLETED/ACTIVE Auto Bridge snapshot.
 // Bridge discovery is intentionally NOT executed here; Full discovery now runs
 // chunked/resumable via /api/config/intermediate-bridges/rebuild. This keeps a
 // normal Chain rebuild from reintroducing the old long-running DB request.
 const [mappingQ,scopeQ,jobsQ,paintQ,chemicalQ,existingQ,batchHistoryQ,masterPartQ,masterFinishQ,masterReqQ]=await Promise.all([
   c.query(`
     with ranked as (
       select
         m.id,m.source_operation_code,m.st_group,m.standard_operation_rule,
         m.mapping_rule,m.sort_order,m.created_at,m.updated_at,
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
         on upper(trim(scope.operation_code))=upper(trim(m.source_operation_code))
        and scope.is_active=true
        and scope.operation_type='PLANNING_OPERATION'
       where m.is_active=true
     )
     select id,source_operation_code,st_group,standard_operation_rule,
            mapping_rule,sort_order,created_at,updated_at
     from ranked
     where rn=1
     order by source_operation_code
   `),
   c.query(`
     select standard_operation
     from md_planning_operation_scope
     where is_active=true
     order by sort_order,standard_operation
   `),
   c.query(`
     select job_num,part_num,revision_num,last_operation,next_operation,all_operation,source_data
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
     select operation_code,recipe_key,priority,is_default,updated_at,selection_rule,
            batch_key_template,batch_no_prefix
     from md_main_operation_recipe
     where is_active=true
     order by operation_code,priority,is_default desc,updated_at asc
   `),
   c.query(`
     select job_num,operation_instance_key,status,recipe_key
     from planning_job_operation
     where is_active=true
   `),
   c.query(`
     select
       bj.job_num,
       bj.planning_job_operation_id,
       coalesce(
         nullif(trim(bj.operation_instance_key_snapshot),''),
         p.operation_instance_key
       ) operation_instance_key_snapshot,
       coalesce(nullif(trim(bj.standard_operation),''),p.standard_operation) standard_operation,
       coalesce(nullif(trim(bj.source_operation_code),''),p.source_operation_code) source_operation_code,
       coalesce(bj.source_seq_snapshot,p.source_seq) source_seq_snapshot,
       b.status batch_status,
       exists(
         select 1
         from planning_schedule ps
         where ps.batch_id=b.id
           and ps.status<>'CANCELLED'
           and ps.planned_start is not null
       ) is_scheduled
     from planning_batch_job bj
     join planning_batch b
       on b.id=bj.batch_id
      and b.status<>'CANCELLED'
     left join planning_job_operation p
       on p.id=bj.planning_job_operation_id
   `),
   // v269: cột Master Data theo Part+Revision (MD:...) để khớp điều kiện recipe.
   c.query(`
     select part_num,program,part_cluster,part_description,surface_dm2
     from md_part where is_active=true
   `),
   c.query(`
     select part_num,revision_num,primer1,primer2,primer3,topcoat1,topcoat2,
            antiabration,primer1_name,topcoat_name,antiabrasion_name,varinish_name,
            alloy,temper,tsa,chemicalconv_airbus
     from md_material_finish where is_active=true
   `),
   c.query(`
     select part_num,revision_num,requirement_code,requirement_value
     from md_process_requirement where is_active=true
   `),
 ]);

 const planningScope=new Set<string>(
   scopeQ.rows.map((r:any)=>clean(r.standard_operation)).filter(Boolean)
 );

 // v288: AllOperation of EACH Job is the only source of source occurrence
 // identity. Never derive source_seq from a Part/Revision join because multiple
 // open Jobs of the same Part/Rev can multiply the routing rows.
 const mappingBySource=new Map<string,Mapping>();
 for(const r of mappingQ.rows){
   const k=clean(r.source_operation_code).toUpperCase();
   if(k)mappingBySource.set(k,r as Mapping);
 }

 const intermediateRules=await loadIntermediateBridgeRules(c);
 const bridgeDiscovery={
  source:"ACTIVE_SNAPSHOT",
  segments:intermediateRules.length,
  operationRows:intermediateRules.reduce((n,r)=>n+r.intermediateOperations.length,0)
 };

 const paintRecipes=new Map<string,string>();
 for(const r of paintQ.rows){
   paintRecipes.set(
     `${clean(r.part_num)}\u0001${clean(r.revision_num)}\u0001${clean(r.standard_operation)}`,
     clean(r.recipe_key)
   );
 }

 const chemicalLists=new Map<string,RecipeCandidateItem[]>();
 for(const r of chemicalQ.rows){
   const k=clean(r.operation_code).toUpperCase();
   const arr=chemicalLists.get(k)||[];
   arr.push({
     recipe_key:clean(r.recipe_key),
     priority:r.priority==null?null:Number(r.priority),
     is_default:!!r.is_default,
     updated_at:r.updated_at,
     selection_rule:r.selection_rule?clean(r.selection_rule):null,
     batch_key_template:r.batch_key_template?clean(r.batch_key_template):null,
     batch_no_prefix:r.batch_no_prefix?clean(r.batch_no_prefix):null
   });
   chemicalLists.set(k,arr);
 }


 // v269: cột Master Data theo Part+Revision (MD:...) — gộp vào dữ liệu job.
 const masterByPartRev=new Map<string,Record<string,string>>();
 const putMaster=(key:string,field:string,val:unknown)=>{
   if(val==null)return;
   const t=String(val).trim();
   if(!t)return;
   let rec=masterByPartRev.get(key);
   if(!rec){rec={};masterByPartRev.set(key,rec);}
   rec[field]=t;
 };
 for(const r of masterPartQ.rows){
   const k=`${clean(r.part_num).toUpperCase()}\u0001`;
   putMaster(k,"MD:PROGRAM",r.program);
   putMaster(k,"MD:PART_CLUSTER",r.part_cluster);
   putMaster(k,"MD:PART_DESCRIPTION",r.part_description);
   putMaster(k,"MD:SURFACE_DM2",r.surface_dm2);
 }
 for(const r of masterFinishQ.rows){
   const k=`${clean(r.part_num).toUpperCase()}\u0001${clean(r.revision_num).toUpperCase()}`;
   putMaster(k,"MD:ALLOY",r.alloy);
   putMaster(k,"MD:TEMPER",r.temper);
   putMaster(k,"MD:TSA",r.tsa);
   putMaster(k,"MD:CHEMCONV_AIRBUS",r.chemicalconv_airbus);
   putMaster(k,"MD:PRIMER1",r.primer1);
   putMaster(k,"MD:PRIMER2",r.primer2);
   putMaster(k,"MD:PRIMER3",r.primer3);
   putMaster(k,"MD:TOPCOAT1",r.topcoat1);
   putMaster(k,"MD:TOPCOAT2",r.topcoat2);
   putMaster(k,"MD:ANTIABRASION",r.antiabration);
   putMaster(k,"MD:PRIMER1_NAME",r.primer1_name);
   putMaster(k,"MD:TOPCOAT_NAME",r.topcoat_name);
   putMaster(k,"MD:ANTIABRASION_NAME",r.antiabrasion_name);
   putMaster(k,"MD:VARINISH_NAME",r.varinish_name);
 }
 for(const r of masterReqQ.rows){
   const k=`${clean(r.part_num).toUpperCase()}\u0001${clean(r.revision_num).toUpperCase()}`;
   putMaster(k,`MD:REQ:${clean(r.requirement_code).toUpperCase()}`,r.requirement_value);
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

 // Durable PLANNED/SCHEDULED history from actual Batch membership.
 //
 // Identity priority:
 // 1) operation_instance_key_snapshot (stable Main + occurrence identity),
 // 2) Standard Operation + original source sequence,
 // 3) Standard Operation + source Operation Code only when that pair occurs
 //    exactly once in the current full route.
 //
 // source_seq can move after Routing Detail / ST Mapping is rebuilt. Relying
 // on source_seq alone caused a historical scheduled CPBILP to be missed,
 // which reset CPBILP to ELIGIBLE and left immediate-next BSAUNSLD LOCKED.
 // We still keep the exact-sequence check as a safe fallback for old history.
 const plannedHistoryExactByJob=new Map<string,Set<string>>();
 const scheduledHistoryExactByJob=new Map<string,Set<string>>();
 const plannedHistoryInstanceByJob=new Map<string,Set<string>>();
 const scheduledHistoryInstanceByJob=new Map<string,Set<string>>();
 const plannedHistorySourceByJob=new Map<string,Set<string>>();
 const scheduledHistorySourceByJob=new Map<string,Set<string>>();

 for(const r of batchHistoryQ.rows){
   const job=clean(r.job_num);
   const std=clean(r.standard_operation).toUpperCase();
   const sourceCode=clean(r.source_operation_code).toUpperCase();
   const instanceKey=clean(r.operation_instance_key_snapshot).toUpperCase();
   const sourceSeq=Number(r.source_seq_snapshot);

   if(instanceKey){
     const plannedSet=plannedHistoryInstanceByJob.get(job)||new Set<string>();
     plannedSet.add(instanceKey);
     plannedHistoryInstanceByJob.set(job,plannedSet);

     if(Boolean(r.is_scheduled)){
       const scheduledSet=scheduledHistoryInstanceByJob.get(job)||new Set<string>();
       scheduledSet.add(instanceKey);
       scheduledHistoryInstanceByJob.set(job,scheduledSet);
     }
   }

   if(std && Number.isFinite(sourceSeq)){
     const key=`${std}\u0001${sourceSeq}`;

     const plannedSet=plannedHistoryExactByJob.get(job)||new Set<string>();
     plannedSet.add(key);
     plannedHistoryExactByJob.set(job,plannedSet);

     if(Boolean(r.is_scheduled)){
       const scheduledSet=scheduledHistoryExactByJob.get(job)||new Set<string>();
       scheduledSet.add(key);
       scheduledHistoryExactByJob.set(job,scheduledSet);
     }
   }

   if(std&&sourceCode){
     const key=`${std}\u0001${sourceCode}`;
     const plannedSet=plannedHistorySourceByJob.get(job)||new Set<string>();
     plannedSet.add(key);
     plannedHistorySourceByJob.set(job,plannedSet);

     if(Boolean(r.is_scheduled)){
       const scheduledSet=scheduledHistorySourceByJob.get(job)||new Set<string>();
       scheduledSet.add(key);
       scheduledHistorySourceByJob.set(job,scheduledSet);
     }
   }
 }

 let jobs=0;
 let operations=0;
 let eligible=0;
 let locked=0;
 let preservedPlanned=0;
 let allOperationFallbackAnchored=0;
 let bridgePairAnchored=0;
 let directNextMainAnchored=0;
 let noChain=0;
 let allOperationJobs=0;

 // v288: rebuild the LIVE chain from canonical Job AllOperation every time.
 // Historical Batch/Schedule records are NOT deleted; they are reconciled back
 // onto the canonical rows below. Keeping stale PLANNED rows active was one of
 // the causes of duplicate Main occurrences after a rebuild.
 await c.query(`
   update planning_job_operation p
   set is_active=false,updated_at=now()
   where p.is_active=true
     and exists(
       select 1
       from open_job_current j
       where j.job_num=p.job_num
         and j.is_open=true
     )
 `);

 const rows:any[][]=[];

 for(const job of jobsQ.rows){
   jobs++;

   // v288: source_seq MUST come from this Job's own AllOperation, before any
   // mapping/scope filtering. Never inject/reorder operations for chain identity.
   // Physical position uses only LastLaborOp + NextOperation as All Open Job
   // position inputs. Resolver order: Segment -> AllOperation fallback (including
   // first Main Planning when neither pair code exists) -> direct NextOperation
   // Main rescue -> NO CHAIN.
   const raw=splitAllOperation(job.all_operation);
   allOperationJobs++;
   const nextCode=clean(job.next_operation);

   // IMPORTANT: canonical source occurrence always comes from this Job's own
   // AllOperation. Intermediate raw operations are intentionally absent there.
   const full=standardize(raw,mappingBySource,planningScope);

   const jobNum=clean(job.job_num);
   const existing=existingByJob.get(jobNum)||new Map();
   const plannedHistoryExact=plannedHistoryExactByJob.get(jobNum)||new Set<string>();
   const scheduledHistoryExact=scheduledHistoryExactByJob.get(jobNum)||new Set<string>();
   const plannedHistoryInstance=plannedHistoryInstanceByJob.get(jobNum)||new Set<string>();
   const scheduledHistoryInstance=scheduledHistoryInstanceByJob.get(jobNum)||new Set<string>();
   const plannedHistorySource=plannedHistorySourceByJob.get(jobNum)||new Set<string>();
   const scheduledHistorySource=scheduledHistorySourceByJob.get(jobNum)||new Set<string>();
   const sourceMainCount=new Map<string,number>();
   for(const routeOp of full){
     const key=`${routeOp.standardOperation.toUpperCase()}\u0001${routeOp.sourceCode.toUpperCase()}`;
     sourceMainCount.set(key,(sourceMainCount.get(key)||0)+1);
   }

   const routeOpHistory=(routeOp:RawPlanningOp)=>{
     const instanceHistoryKey=routeOp.instanceKey.toUpperCase();
     const exactHistoryKey=`${routeOp.standardOperation.toUpperCase()}\u0001${routeOp.sourceSeq}`;
     const sourceHistoryKey=`${routeOp.standardOperation.toUpperCase()}\u0001${routeOp.sourceCode.toUpperCase()}`;
     const uniqueSourceMain=(sourceMainCount.get(sourceHistoryKey)||0)===1;
     return {
       planned:
         plannedHistoryInstance.has(instanceHistoryKey) ||
         plannedHistoryExact.has(exactHistoryKey) ||
         (uniqueSourceMain&&plannedHistorySource.has(sourceHistoryKey)),
       scheduled:
         scheduledHistoryInstance.has(instanceHistoryKey) ||
         scheduledHistoryExact.has(exactHistoryKey) ||
         (uniqueSourceMain&&scheduledHistorySource.has(sourceHistoryKey))
     };
   };

   const anchor=currentAnchor(
     raw,
     full,
     clean(job.last_operation),
     nextCode,
     intermediateRules
   );

   if(anchor.mode==="BRIDGE_PAIR")bridgePairAnchored++;
   else if(anchor.mode==="ALLOPERATION_FALLBACK")allOperationFallbackAnchored++;
   else if(anchor.mode==="DIRECT_NEXT_MAIN")directNextMainAnchored++;
   else noChain++;

   const chain=planningChainFromAnchor(full,anchor);

   // v312 PLAN-AHEAD STATUS RULE:
   // Physical position has already been resolved from LastLaborOp + NextOperation.
   // Therefore every active Main in `chain` is either the Current Main or a
   // future Next Main and is READY by default. This intentionally allows the
   // planner to create Batches ahead of the current production position.
   //
   // Status precedence for Current + future Main(s):
   // 1. Existing non-cancelled Batch membership => PLANNED.
   // 2. Otherwise => ELIGIBLE (shown as READY).
   //
   // Main(s) before Current are not part of this active suffix. Route Matrix
   // displays their actual Batch/Schedule history when present; if there is no
   // history, progress position itself marks them DONE. No Schedule handoff is
   // required to make later Main(s) READY.

   for(let i=0;i<chain.length;i++){
     const op=chain[i];
     const old=existing.get(op.instanceKey);

     const history=routeOpHistory(op);
     const historicalPlanned=history.planned;

     let status:string;

     if(historicalPlanned){
       status="PLANNED";
       preservedPlanned++;
     }else{
       status="ELIGIBLE";
       eligible++;
     }

     let recipeKey:string|null=null;

     // v280: Mapping Main Operation · Operation Code là nguồn ưu tiên cho MỌI
     // công đoạn. Recipe theo Part+Revision chỉ là fallback cho sơn khi mã công
     // đoạn chưa có mapping phù hợp điều kiện Job.
     const mkey=`${clean(job.part_num).toUpperCase()}\u0001${clean(job.revision_num).toUpperCase()}`;
     const md=masterByPartRev.get(mkey);
     const data=md?{...(job.source_data||{}),...md}:(job.source_data||null);
     const list=chemicalLists.get(op.sourceCode.toUpperCase())||[];
     recipeKey=pickBestRecipeForJob(list,data);
     if(!recipeKey && ["PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI-ABRASION","VARNISH"].includes(op.standardOperation)){
       recipeKey=paintRecipes.get(
         `${clean(job.part_num)}\u0001${clean(job.revision_num)}\u0001${op.standardOperation}`
       )||null;
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
       job.job_num,op.instanceKey,op.sourceSeq,op.planningSeq,
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

 return {
   jobs,operations,eligible,locked,preservedPlanned,
   bridgePairAnchored,allOperationFallbackAnchored,directNextMainAnchored,noChain,
   // Backward-compatible aliases for older clients/log parsers.
   rawPairAnchored:allOperationFallbackAnchored,
   sequenceCheck:noChain,
   allOperationJobs,bridgeDiscovery
 };
}
