export type StLogicSection={key:string;title:string;content:string};

export const ST_AI_KNOWLEDGE_VERSION="V439";

export const ST_AI_LOGIC_SECTIONS:StLogicSection[]=[
 {
  key:"canonical-flow",
  title:"Canonical ST Planning flow",
  content:`Import Master Data -> Import All Open Job snapshot -> ST Scope visibility -> ST Operation Mapping -> Main Operation -> Planning Chain -> Planning Board creates/updates Batch -> Scheduling Board assigns the existing Batch to Resource/Date/Start/Duration -> Production Execution reports WAITING/ON-GOING/DONE separately -> Dashboard/AI analyzes read-only operational data. Job Tracker and Part Tracker are read-only trace views.`
 },
 {
  key:"database-provider",
  title:"Database provider architecture · V439",
  content:`Aiven PostgreSQL is the canonical operational database. Runtime database access uses standard PostgreSQL through DATABASE_URL and the pg driver; Supabase/Supavisor-specific DNS/pooler selection is removed. V439 maps Node pg sslmode=require to libpq-compatible encrypted TLS semantics so Aiven does not fail with SELF_SIGNED_CERT_IN_CHAIN; optional DATABASE_CA_CERT enables strict CA verification. Aiven Free has a small connection budget, so Vercel local DB_POOL_MAX defaults to 1. During the migration phase Supabase may remain only for Storage/Auth; no Planning/Master/Dashboard database reads or writes may use Supabase REST. The first migration copies the full current public schema and full public data without history/index cleanup; database reduction happens only after Aiven cutover is verified. Planning Chain, Recipe, Batch, Schedule, Chemical Line, Masking/Unmasking and Production business logic are unchanged by the provider move.`
 },
 {
  key:"next-operation-order",
  title:"NextOperation and presentation order",
  content:`When Planning Board Sort Priority contains NextOperation, resolve RAW NextOperation -> ST Operation Mapping -> Main Operation -> Main Planning Order. Operation Code Order is only an optional tie-breaker inside the same Main. The canonical presentation default is NextOperation ASC -> Priority DESC -> Job ASC. Presentation sorting does not itself change READY/WAIT, Batch, Schedule, or Auto Planning.`
 },
 {
  key:"planning-chain",
  title:"Planning Chain and READY/WAIT",
  content:`Planning Chain is the source of truth for sequential planning handoff. planning_job_operation represents canonical Main Planning occurrences with operation_instance_key and underlying status LOCKED/ELIGIBLE/PLANNED. READY in the UI corresponds to the eligible next planning occurrence; a created Batch records durable Batch history. Repeated raw operations are resolved by occurrence identity rather than raw text alone. Job/Main Hold is a separate planning gate on the exact occurrence and does not change Batch/Schedule Hold semantics.`
 },
 {
  key:"st-scope",
  title:"ST Scope and Intermediate operations",
  content:`Planning Chain workload remains based on Current Main and excludes ST_SCOPE_ONLY from Planning/Batch/Schedule. Dashboard chart 2 (Surface + Qty by Main / Immediate / ST Only) is a read-only current-position view. Current Main comes from the live Planning Chain suffix already positioned by the canonical LastOperation + RAW NextOperation resolver. Dashboard then filters RAW NextOperation by explicit md_st_operation_scope membership. PLANNING_OPERATION is MAIN, INTERMEDIATE is IMMEDIATE, and ST_SCOPE_ONLY is ST ONLY. Bridge Role is diagnostic only and must not be used as a second inclusion gate after Current Main has already resolved. CAT3/CAT5 use one current row per Job and are sorted directly by RAW NextOperation Order: md_operation.planning_sort_order first; resolved Main Planning Order is only a fallback when the RAW operation has no explicit order; then RAW NextOperation and Job. The INTERMEDIATE tag is Dashboard-only membership: it does not make a Job appear in All Open Jobs, does not create or deactivate Planning Chain rows, and does not affect Candidate, Batch, Recipe or Schedule.`
 },
 {
  key:"recipe-batch",
  title:"Recipe, Batch Key and Batch compatibility",
  content:`Runtime Recipe proposal is resolved from active Main Operation Recipe rules plus Process Recipe Master and Job/Part source data. Recipe selection can depend on Open Job columns and rule priority/default. Batch compatibility controls which Jobs may be grouped; Batch stores the selected condition subset. Existing Batch Recipe does not silently change when a recipe rule is edited.`
 },
 {
  key:"paint-occurrence",
  title:"Paint occurrence logic",
  content:`PRIMER occurrences are standardized as PRIMER/PRIMER2/PRIMER3 and TOPCOAT occurrences as TOPCOAT1/TOPCOAT2 according to route occurrence. Recipe resolution must evaluate the condition for the correct occurrence so PRIMER1 cannot select a PRIMER2/PRIMER3-specific rule merely because the same raw operation code repeats.`
 },
 {
  key:"batch-schedule",
  title:"Batch vs Scheduling",
  content:`Planning Board creates and owns Batch membership. Scheduling Board never recreates the Batch; it assigns an existing unscheduled Batch to a Schedule Area/Resource/Date/Start/Duration. V434 makes the Unscheduled pool stateful in the UI: once a Batch is picked into any draft schedule row it disappears from every Unscheduled list to prevent duplicate selection; clearing the draft returns it immediately. After Save it stays hidden while an active Schedule exists. “Bỏ điều độ” cancels only the Schedule and preserves the Batch/Batch Jobs so the Batch returns to Unscheduled; deleting the Batch remains a separate destructive action. Manual and future Auto Plan/Auto Batch/Auto Schedule share the same Batch/Schedule data model. When an existing Planning Batch is ADDED to Scheduling, Scheduling applies a physical predecessor lock per Job. If the immediate Previous Main is already DONE by physical Job progress and has no historical Batch, it is accepted without requiring a Schedule. Otherwise that exact Previous Main must have a non-cancelled Schedule with planned_end, and Current Main planned_start must be greater than or equal to that Previous Main planned_end. First Main has no predecessor and is allowed. This add-only lock is stricter than Planning Chain READY, which may open after an unscheduled Previous Main Batch exists. PATCH/Edit and Trial Day Shift are intentionally outside this add-only rule. Chemical Line simulation/proposal logic is not changed; the predecessor guard validates only the final effective start at Save, after the existing Chemical proposal/capacity engine has finished. Recipe selectors on Scheduling Board are area-scoped: each lane shows only Recipes whose active md_main_operation_recipe.standard_operation belongs to the Main Operation pool mapped to that Schedule Area; grouped lanes use the union pool, and existing historical Recipe values remain visible when editing. Trial day shifting on Scheduling Board is a schedule-only MOVE, never a clone: all active schedules of the selected board date are shifted in-place by exactly ±1 day, including Chemical Loading/Process/NDT/Unloading timestamps, while Batch identity/membership/Recipe/Resource/Duration stay unchanged. After a successful move the source date must be empty. The operation is transactional and refuses to merge with an occupied target day or move RUNNING/COMPLETED schedules.`
 },
 {
  key:"planning-ready-focus",
  title:"Planning Board READY focus context",
  content:`When an Area is selected, every Area keeps the same Candidate context baseline (Job, PartDescription, CurrentGoodWIPQty, TotalSurface, LastLaborOp, NextOperation, Priority, OpenDMR when available), then shows one virtual Previous Main column plus all Main Operations mapped to that Area. When a READY Main establishes Batch Selection Mode, it narrows to Previous Main + the selected Main + one virtual Next Main Planning column. Previous Main is read-only context with status, prior Batch No, resource and schedule time. The selected Main shows status only; Next Main Planning shows that next Main and its own Recipe when applicable. Compact row density and 70%-130% table zoom are presentation-only.`
 },

 {
  key:"job-main-hold",
  title:"Job/Main Hold",
  content:`Planner Hold is stored on the exact planning_job_operation occurrence using is_hold plus reason/note/user/time. On Planning Matrix, right-click an unbatched READY/WAIT Main and choose Hold; held Jobs remain visible in Candidate Jobs and the exact cell displays HOLD. Right-click a held cell and choose Unhold. A held occurrence cannot be added to Batch and the Batch API validates the hold again server-side. Hold survives All Open Job incremental imports and normal chain rebuilds for the same live occurrence. Release Hold clears only hold metadata and incrementally recalculates READY/WAIT for that Job. planning_schedule.status=HOLD remains a separate Batch/Schedule-level state.`
 },
 {
  key:"chemical-line",
  title:"Chemical Line scheduling",
  content:`Chemical Line uses six Flybar resources. Chemical scheduling includes Loading -> Process -> NDT when applicable -> Unloading phases. Preclean NDT applies to configured preclean recipes and has dedicated overlap/spacing rules. Resource capacity, launch spacing and handling/process time rules are deterministic scheduler constraints, not AI decisions.`
 },
 {
  key:"painting",
  title:"Painting scheduling",
  content:`Painting uses independent cabin resources CAB1..CAB4 plus Powder where configured. Paint Batch/Recipe rules and process-time rules remain deterministic. AI may identify workload imbalance or delay evidence but must not move a Batch or override recipe/resource compatibility.`
 },
 {
  key:"masking-unmasking",
  title:"Masking / Unmasking",
  content:`Masking and Unmasking are derived support work from detailed physical routing around the related Main Planning Batch. Production Execution may show their Job-level details, but they do not replace the Main Planning Chain or create a separate Main Batch flow. V437 preserves the same resolver but first limits candidate Batch/Job rows by selected view/date, then rebuilds Routing Main only for the affected Part/Revision set; it must never scan/rebuild the whole Routing Detail master merely to render one day/view.`
 },
 {
  key:"production-execution",
  title:"Production Execution",
  content:`Production Execution reads scheduled production plus derived Masking/Unmasking work. WAITING/ON-GOING/DONE and Actual Start/End are execution-report facts and are intentionally independent from Planning Chain and planning_schedule status. V437 reuses the narrowed support resolver and derives Batch jobNumbers from the already-loaded Batch Job detail set instead of issuing a second per-Batch aggregation.`
 },

 {
  key:"dashboard-status",
  title:"Dashboard workload status",
  content:`Dashboard workload uses WAIT, READY, PLANNED-UNSCHEDULED, SCHEDULED and HOLD only. PLANNED remains an internal Planning Chain/Batch-history state, not a separate Dashboard bucket. If an active planning occurrence is internally PLANNED and has no Schedule, Dashboard classifies it as PLANNED-UNSCHEDULED. This normalization is presentation/aggregation only and does not rewrite Planning Chain state.`
 },
 {
  key:"ai-boundary",
  title:"AI safety boundary",
  content:`AI is Read / Analyze / Recommend only. Deterministic application/SQL logic remains source of truth. AI must never claim it created/deleted a Batch, changed Recipe, moved Schedule, changed READY/WAIT, edited configuration, or changed Production Execution. Operational changes require the existing application workflow and planner approval.`
 },
];

export const ST_AI_SYSTEM_KNOWLEDGE=ST_AI_LOGIC_SECTIONS
 .map(x=>`[${x.title}] ${x.content}`)
 .join("\n");

export function getStLogicReference(topic?:string){
 const q=String(topic||"").trim().toLowerCase();
 if(!q)return {version:ST_AI_KNOWLEDGE_VERSION,sections:ST_AI_LOGIC_SECTIONS};
 const words=q.split(/\s+/).filter(Boolean);
 const matched=ST_AI_LOGIC_SECTIONS.filter(section=>{
  const hay=`${section.key} ${section.title} ${section.content}`.toLowerCase();
  return words.some(word=>hay.includes(word));
 });
 return {version:ST_AI_KNOWLEDGE_VERSION,sections:matched.length?matched:ST_AI_LOGIC_SECTIONS};
}


// V426
export const V426_WORKLOAD_PRESENTATION = `Planning Board Workload Summary keeps the V425 Candidate/Route-Matrix population and splits READY into two read-only columns by the immediate Previous Main scheduling context: Previous Main Scheduled versus Previous Main Unscheduled / START. The two READY sub-buckets sum to the original READY total and do not change Sequential READY gating. Dashboard Surface+Qty combo chart uses the full panel width. Scheduling Board shows ST Workload Summary · By Area above each top-level schedule area by reusing the canonical Dashboard ST workload engine and filtering it by that Schedule Area's mapped Main Operation pool; no separate scheduling workload formula is allowed.`;


// V430
export const V430_TRIAL_SCHEDULE_DAY_SHIFT = `Scheduling Board trial control moves the entire selected schedule day in-place by +1 or -1 calendar day. It never clones Batch or planning_schedule rows. The source Board date is required to be empty after commit; the destination must not contain independent active schedules. All planned and Chemical Line segment timestamps shift together, Resource/Recipe/Duration/Sequence/status remain unchanged, and planning_batch planned_start/planned_end are synchronized. RUNNING/COMPLETED schedules are not movable. The whole operation is one transaction and rolls back on any conflict. This utility is Schedule-only and does not change Planning Chain, Candidate, Batch membership or Recipe.`;

// V431
export const V431_SCHEDULE_AREA_RECIPE_FILTER = `Scheduling Board Recipe selectors are scoped by Schedule Area/Main Operation mapping. A Recipe is selectable in a lane only when an active md_main_operation_recipe row maps that recipe_key to a standard_operation in the lane's md_schedule_area_operation pool; grouped hubs use the union pool. Existing Schedule/Batch edits preserve the current Recipe option if configuration changed, but unrelated Recipes are not offered. Create Empty Batch filters by the selected Main Operation, and manual-grid creation revalidates Recipe -> Main server-side. This does not alter Planning Board Recipe resolution or existing Batch membership.`;


// V432
export const V432_SCHEDULE_PREVIOUS_MAIN_LOCK = `Superseded by V433 for the DONE-without-Batch case. V432 introduced the add-only Previous Main scheduling guard.`;

// V433
export const V433_SCHEDULE_PREVIOUS_MAIN_STATUS = `Scheduling Board Previous Main cards resolve the exact immediate predecessor occurrence and show DONE / SCHEDULED / UNSCHEDULED / NOT_PLANNED instead of treating every no-Batch predecessor as unscheduled. DONE means the durable Previous Main snapshot has moved behind the active physical Planning Chain, so the Job already passed that Main even if no Batch was created. On POST /api/schedule, DONE with no historical Batch satisfies the predecessor lock. If a Previous Main Batch exists but is UNSCHEDULED, it still must be scheduled first. For a scheduled predecessor, Current planned_start must remain >= Previous planned_end. This remains add-only and does not change Chemical Line proposal logic, PATCH/Edit, Trial Day Shift, Planning READY/WAIT, or Dashboard.`;

export const V436_IMMEDIATE_SCHEDULE_STATUS_SYNC = `Scheduling Board must reflect Schedule state immediately after a successful Save without requiring a browser page refresh. Active scheduling state is derived from a non-cancelled planning_schedule, not by changing planning_batch.status. On successful Save, client state removes the Batch from every Unscheduled pool, inserts/updates the saved Schedule row immediately from the POST response, broadcasts st-batch-schedule-state to sibling Scheduling components, and broadcasts st-schedule-changed so ST Workload Summary refreshes. Bỏ điều độ performs the inverse immediately, then /api/schedule/rows reconciles server truth with cache:no-store. This is UI/state synchronization only and does not change Chemical proposal, predecessor guard, Planning Chain, Candidate, Batch membership, Recipe, Dashboard, or Trial day shift.`;


// V437
export const V437_MASKING_PRODUCTION_LOAD_PERFORMANCE = `Masking/Unmasking and Production Execution page load optimization only: candidate Batch/Job rows are filtered by selected scheduled/unscheduled view and schedule date before physical routing reconstruction; md_routing_detailed is then restricted to only candidate Part/Revision pairs. Previous Main -> Current Main support boundaries, PRIMER/TOPCOAT occurrence identity, Batch/Schedule ownership and execution states are unchanged. Production Execution also reuses loaded Batch Job details for jobNumbers instead of a duplicate per-Batch array aggregation. Migration 072 adds normalized active Part/Revision/source_seq and Batch Job read indexes only.`;
