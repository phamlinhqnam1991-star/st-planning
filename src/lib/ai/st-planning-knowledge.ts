export type StLogicSection={key:string;title:string;content:string};

export const ST_AI_KNOWLEDGE_VERSION="V504";

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
  key:"aiven-planning-pool",
  title:"Aiven Planning pool safety · V442",
  content:`Aiven remains canonical PostgreSQL and DB_POOL_MAX defaults to 1 to protect the Free 20-connection budget. Planning Board server render and Candidate loading must not acquire a second client from the same one-slot pool while already holding the first client. V442 resolves Planning static data before reserving the live page client, reuses that client for initial metadata, and reuses the existing Candidate client for side reads whenever DB_POOL_MAX=1. If DB_POOL_MAX is explicitly raised above 1, the historical two-client parallel Candidate path remains available. This changes connection scheduling only; Planning Chain, Candidate population, Recipe, Batch, Schedule, Chemical Line, Masking/Unmasking, Production and Dashboard rules are unchanged.`
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
  key:"all-open-job-planning-audit",
  title:"All Open Jobs Cross Check / Audit Missing · V501",
  content:`Cross Check / Audit Missing is a read-only source-to-board reconciliation. Its source population is every open_job_current row with is_open=true, including rows outside ST, so missing-source rows are never silently discarded before diagnosis. Planning Board=YES means the RAW NextOperation belongs to the canonical Planning Board RAW scope (active PLANNING_OPERATION or active Intermediate Bridge, excluding ST_SCOPE_ONLY) and the Job has a live active planning_job_operation occurrence. Planning Board=NO carries a deterministic reason: empty NextOperation, ST_SCOPE_ONLY, outside ST Planning scope/Bridge, missing Source->Main mapping, Intermediate Bridge without resolved chain, no active Planning Chain requiring rebuild/route diagnosis, RAW/chain mismatch, or a final population mismatch. Column filters are diagnostic only. V504 changes categorical Audit filters to multi-select lists populated from unique values in the complete open-job audit population; WIP Qty and Surface dm² are also exact-value multi-select lists, matching the same per-column list behavior. A saved Planning Board VIEW/filter may still hide a Job whose canonical audit result is YES. The audit never rebuilds or mutates Planning Chain, Recipe, Batch, Schedule or Auto Planning.`
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
  key:"production-day-boundary",
  title:"Canonical Production Day · V445",
  content:`The entire operational app uses one canonical production-day ownership rule: 06:00 local Asia/Ho_Chi_Minh on date D <= planned_start < 06:00 on D+1 means the Schedule belongs to production date D. Therefore a Schedule starting 00:00-05:59 on the next calendar date still belongs to D. Ownership is determined by planned START, so a Batch may end after the next 06:00 and still belongs to D. Scheduling Board table/timeline, live schedule-row refresh, Masking/Unmasking scheduled view, Production Execution, daily Dashboard metrics/trend and AI day operations all use this same boundary. planning_schedule.schedule_date is canonicalized to the production date as local planned_start minus six hours; migration 073 backfills existing rows. This date rule does not change Planning Chain, Batch membership, Recipe, Previous Main lock, Chemical Line proposal/capacity or Production execution status semantics.`
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
  content:`Chemical Line uses six Flybar resources. Chemical scheduling includes Loading -> Process -> NDT when applicable -> Unloading phases. Preclean NDT applies to configured preclean recipes and has dedicated overlap/spacing rules. V457 enforces one-to-one continuation linking: one Previous/Preclean Flybar source may feed only one downstream Flybar row; duplicate manual links are blocked in the UI and revalidated by the chemical simulation engine. Source and downstream rows share a visual link color/badge. Resource capacity, launch spacing and handling/process time rules are deterministic scheduler constraints, not AI decisions.`
 },
 {
  key:"painting",
  title:"Painting scheduling",
  content:`Painting uses independent cabin resources CAB1..CAB4 plus Powder where configured. Paint Batch/Recipe rules and process-time rules remain deterministic. AI may identify workload imbalance or delay evidence but must not move a Batch or override recipe/resource compatibility.`
 },
 {
  key:"masking-unmasking",
  title:"Masking / Unmasking",
  content:`Masking and Unmasking are derived support work from detailed physical routing around the related Main Planning Batch. Explicit Main support configuration is strict at Main level: once a Main has any support configuration, an unselected support type is NONE and must not fall back to routing. V453 presents one Preparation row per Job/Batch/Main and lists support steps in execution order Unmasking → Masking while preserving each underlying support operation. Production Execution uses the same combined Job presentation; each Unmasking/Masking step keeps its own execution status, actual time and note. These support rows do not replace the Main Planning Chain or create a separate Main Batch flow.`
 },
 {
  key:"production-execution",
  title:"Production Execution",
  content:`Production Execution reads every scheduled work item whose planned_start belongs to the canonical production day 06:00 D <= planned_start < 06:00 D+1, plus derived Masking/Unmasking support work. Chemical Line and Painting are reported directly per scheduled Batch/row using the parent production_execution record and do not load/show Job detail for reporting; all other production areas retain Job-level WAITING/ON-GOING/DONE and Actual Start/End in production_execution_job with the parent production_execution row as aggregate compatibility summary. The UI has area sub-tabs for Chemical Line; Shot Peening (Automatic + Manual); Masking & Unmasking; Painting; Sirius Cleaning; Blasting (Manual + Auto); Plating (Plating + He-Bake); and Passivation/Brightening, while preserving an All view and an Other fallback only when unmapped work exists. V448 strengthens visual separation between report panels. V455 supersedes the old Masking/Unmasking Main-panel grouping: combined Preparation Jobs are grouped by the physical area of the linked Main Planning operation, while each Job retains its linked Main and Unmasking → Masking step order. Painting Main work remains split into four fixed report panels: CAB1, CAB2, CAB3 and Powercoating. Painting resources other than CAB1/CAB2/CAB3 are kept in Powercoating so no scheduled row is lost. V450 further compacts long production reports by removing the redundant Operation column from Batch rows and Previous/Next Operation columns from Job detail, adding stronger Batch separators, and adding a production Note field. Chemical Line/Painting store Note on the line-level production_execution.remark; Job-reported areas store Note on each production_execution_job.remark. These remarks are execution notes only and do not modify Planning Chain or Schedule. Job rows keep Shift 1 = 06:00-13:59, Shift 2 = 14:00-21:59, Shift 3 = 22:00-05:59 next day. Date navigation reloads the selected production day without F5, and tables do not use inner vertical scroll containers. These execution facts remain independent from Planning Chain and planning_schedule status. V506 adds Production Start Confirmation for Chemical Line and Painting: on the first transition out of WAITING, Production sees every Batch Job checked by default and unchecks Jobs that were NOT LOADED. Unchecked Jobs are removed from the source Batch before actual start, audited as approved production_adjustment_item REMOVE_JOB with reason NOT_LOADED, and recomputed back to the first unplanned/eligible Main without pretending they were processed. Every already-planned downstream Batch that contains such a Job receives a planning_handover_change_event REMOVE_JOB with prefix PRODUCTION_REMOVE_BEFORE_START. The downstream Job remains in that Batch until Scheduling/Shift explicitly uses Shift Accept & Remove; unresolved REMOVE impacts block a downstream Batch from first Start. If the downstream Batch had already started before the impact was created, the event is CRITICAL and automatic removal is rejected as CONFLICT so history is not rewritten. The returned source Job is visibly marked REMOVED FROM PREVIOUS BATCH on Planning Board with its source Batch for audit context. Shift Supervisor receives schedule.view for this alert workflow but still cannot change normal Schedule without schedule.edit; Accept Remove is allowed through production.add_job within Production Area scope or schedule.edit within Schedule Area scope.`
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
export const V426_WORKLOAD_PRESENTATION = `Planning Board Workload Summary keeps the V425 Candidate/Route-Matrix population and splits READY into two read-only columns by the immediate Previous Main scheduling context: Previous Main Scheduled / Done versus Previous Main Unscheduled / START. From V476, a READY First Main with no predecessor belongs to Previous Main Scheduled / Done because there is no upstream handoff to wait for. The two READY sub-buckets sum to the original READY total and do not change Sequential READY gating. From V486, Dashboard ST Workload Summary · By Area displays the same two READY columns instead of one merged READY column; the Dashboard classifier is the same as Planning Board, including Previous Main DONE by physical progress and First Main at chain START. Dashboard Surface+Qty combo chart uses the full panel width. V457 applies the same READY split to Scheduling Board ST Workload Summary · By Area, still reusing the canonical Dashboard ST workload engine and filtering by the Schedule Area's mapped Main Operation pool. Scheduling area blocks are ordered by the earliest Main Planning Order in their operation pool; display_order is a tie-breaker. V496 removes Dashboard KPI cards so Dashboard workload is read from the Area-Main-Recipe table using the same Planning Board status order and tones. Scheduling READY recipe rows use the Main Planning occurrence that is currently READY as the row grain. From V503, the READY · Previous Main Scheduled / Done detail breakdown displays the NEXT Main + NEXT Main Recipe of those READY Jobs; READY · Previous Main Not Yet Scheduled keeps the Current READY Main + Current READY Recipe display. The Previous Main split remains only the handoff/scheduling context. No separate scheduling workload formula is allowed.`;


// V430
export const V430_TRIAL_SCHEDULE_DAY_SHIFT = `Scheduling Board trial control moves the entire selected PRODUCTION DAY in-place by +1 or -1 day. Since V445, the app-wide canonical production day is 06:00 selected date -> 06:00 next date, owned by planned_start, so schedules starting 00:00-05:59 next calendar day still belong to the source production day and move with it instead of blocking the destination. It never clones Batch or planning_schedule rows. schedule_date is recalculated as the canonical production date (Vietnam local planned_start minus six hours); all planned and Chemical Line segment timestamps shift together. The source production day must be empty after commit, and the destination production day must not contain independent active schedules. Resource/Recipe/Duration/Sequence/status remain unchanged, planning_batch planned_start/planned_end are synchronized, RUNNING/COMPLETED schedules are not movable, and the operation is one transaction. This utility is Schedule-only and does not change Planning Chain, Candidate, Batch membership or Recipe.`;

// V431
export const V431_SCHEDULE_AREA_RECIPE_FILTER = `Scheduling Board Recipe selectors are scoped by Schedule Area/Main Operation mapping. A Recipe is selectable in a lane only when an active md_main_operation_recipe row maps that recipe_key to a standard_operation in the lane's md_schedule_area_operation pool; grouped hubs use the union pool. Existing Schedule/Batch edits preserve the current Recipe option if configuration changed, but unrelated Recipes are not offered. Create Empty Batch filters by the selected Main Operation, and manual-grid creation revalidates Recipe -> Main server-side. This does not alter Planning Board Recipe resolution or existing Batch membership.`;


// V432
export const V432_SCHEDULE_PREVIOUS_MAIN_LOCK = `Superseded by V433 for the DONE-without-Batch case. V432 introduced the add-only Previous Main scheduling guard.`;

// V433
export const V433_SCHEDULE_PREVIOUS_MAIN_STATUS = `Scheduling Board Previous Main cards resolve the exact immediate predecessor occurrence and show DONE / SCHEDULED / UNSCHEDULED / NOT_PLANNED instead of treating every no-Batch predecessor as unscheduled. DONE means the durable Previous Main snapshot has moved behind the active physical Planning Chain, so the Job already passed that Main even if no Batch was created. On POST /api/schedule, DONE with no historical Batch satisfies the predecessor lock. If a Previous Main Batch exists but is UNSCHEDULED, it still must be scheduled first. For a scheduled predecessor, Current planned_start must remain >= Previous planned_end. This remains add-only and does not change Chemical Line proposal logic, PATCH/Edit, Trial Day Shift, Planning READY/WAIT, or Dashboard.`;

export const V436_IMMEDIATE_SCHEDULE_STATUS_SYNC = `Scheduling Board must reflect Schedule state immediately after a successful Save without requiring a browser page refresh. Active scheduling state is derived from a non-cancelled planning_schedule, not by changing planning_batch.status. On successful Save, client state removes the Batch from every Unscheduled pool, inserts/updates the saved Schedule row immediately from the POST response, broadcasts st-batch-schedule-state to sibling Scheduling components, and broadcasts st-schedule-changed so ST Workload Summary refreshes. Bỏ điều độ performs the inverse immediately, then /api/schedule/rows reconciles server truth with cache:no-store. This is UI/state synchronization only and does not change Chemical proposal, predecessor guard, Planning Chain, Candidate, Batch membership, Recipe, Dashboard, or Trial day shift.`;


// V437
export const V437_MASKING_PRODUCTION_LOAD_PERFORMANCE = `Masking/Unmasking and Production Execution page load optimization only: candidate Batch/Job rows are filtered by selected scheduled/unscheduled view and schedule date before physical routing reconstruction; md_routing_detailed is then restricted to only candidate Part/Revision pairs. Previous Main -> Current Main support boundaries, PRIMER/TOPCOAT occurrence identity, Batch/Schedule ownership and execution states are unchanged. Production Execution also reuses loaded Batch Job details for jobNumbers instead of a duplicate per-Batch array aggregation. Migration 072 adds normalized active Part/Revision/source_seq and Batch Job read indexes only.`;


export const V449_PRODUCTION_DATE_OWNERSHIP = `Production date ownership is based only on planned_start in Asia/Ho_Chi_Minh shifted back 6 hours. Local 00:00-05:59 belongs to the previous production date. Production Execution and scheduled Masking/Unmasking use this same canonical predicate.`;


// V497
export const V497_SCHEDULING_READY_MAIN_RECIPE = `Scheduling Board ST Workload Summary keeps the two READY columns classified by immediate Previous Main scheduling context, but each READY Recipe-row breakdown now displays the Recipe of the Main Planning occurrence that is READY. Previous Main Recipe is no longer presented in that breakdown. This is a Scheduling Board presentation change only; READY/WAIT gating, Previous Main Scheduled/Done classification, canonical Dashboard workload totals, Batch, Schedule, Recipe resolution and Auto Planning are unchanged.`;


// V498
export const V498_SCHEDULING_OPERATION_CARD_RECIPE_PICKER = `Scheduling Board ST Workload Summary keeps each MAIN TOTAL Operation card, and now shows clickable Recipe choices directly under that Operation card for every visible workload bucket (READY Previous Main Scheduled/Done, READY Previous Main Not Yet Scheduled, WAIT Next Main, WAIT Future Mains, HOLD). Only Recipes with workload in that bucket are shown. Clicking a Recipe opens the existing Planning Board Quick View already filtered by Area + Main Operation + Recipe + bucket. Existing Recipe rows and WAIT Previous Main breakdown remain unchanged. This is presentation/navigation only; canonical workload population, READY/WAIT gating, Recipe resolver, Batch, Schedule and Auto Planning are unchanged.`;

export const V499_SCHEDULING_DETAIL_RECIPE_CLICK = `V499 corrects the V498 Scheduling recipe navigation placement. MAIN TOTAL returns to the compact canonical total only and does not render Recipe choices. Recipe selection/navigation happens directly on the existing detail lines inside each Recipe row. READY detail lines (current READY Main + current READY Recipe) are now clickable and open the existing Planning Board Quick View already filtered by Area + Main Operation + Recipe + READY bucket, matching the direct-click behavior of WAIT · Next Main detail breakdown. Canonical workload population, READY/WAIT gating, Recipe resolver, Batch, Schedule and Auto Planning are unchanged.`;

export const V500_SCHEDULING_DETAIL_ONLY_DASHBOARD_READY_FIRST = `V500 changes presentation only. Scheduling Board ST Workload Summary removes every MAIN TOTAL row and renders Recipe detail rows only; each Recipe row carries its Main Operation label directly so removing the total row does not remove operation context. Existing V499 detail-line Recipe click behavior remains. Dashboard ST Workload Summary · By Area uses this exact display order: READY · Previous Main Scheduled, READY · Previous Main Unscheduled / START, WAIT · Next Main, WAIT · Future Mains, PLANNED-UNSCHEDULED, SCHEDULED, HOLD, ST ONLY, Total. Canonical workload population, READY/WAIT classifiers, Recipe resolution, Batch, Schedule and Auto Planning are unchanged.`;


export const V501_ALL_OPEN_JOB_PLANNING_AUDIT = `V501 adds the read-only All Open Jobs Cross Check / Audit Missing tab. It audits every open source row against canonical Planning Board population and exposes Planning Board YES/NO plus deterministic missing reasons and per-column filters. It does not mutate Planning Chain, Recipe, Batch, Schedule or Auto Planning.`;


export const V503_SCHEDULING_READY_SCHEDULED_NEXT_RECIPE = `V503 changes only Scheduling Board ST Workload Summary presentation/navigation for READY · Previous Main Scheduled / Done. Each Recipe-row READY Scheduled card keeps its canonical current READY Main/Recipe workload total, but the clickable detail breakdown is regrouped by the immediate NEXT Main occurrence and its resolved Recipe, displayed as → Next Main · Next Recipe. Clicking a detail line opens Planning Board Quick View filtered to the same Current Main/Current Recipe/READY bucket plus that Next Main/Next Recipe subset. READY · Previous Main Not Yet Scheduled remains Current READY Main + Current READY Recipe. READY/WAIT classifiers, canonical workload totals, Recipe resolution rules, Batch, Schedule and Auto Planning are unchanged.`;

export const V505_READY_SCHEDULED_NO_NEXT_MAIN_BREAKDOWN = `V505 completes the Scheduling Board READY · Previous Main Scheduled / Done NEXT Main breakdown. READY Jobs at the end of their Planning Chain, where no immediate Next Main exists, are no longer omitted from the detail totals; they are grouped into an explicit → NO NEXT MAIN · — detail row with the same Job/Qty/Surface metric. Clicking that row opens the canonical READY Scheduled Quick View filtered to only Jobs with no next Planning Main. This is presentation/navigation completeness only: canonical READY/WAIT classification, current Recipe total, Recipe resolution, Batch, Schedule and Auto Planning remain unchanged.`;

export const V504_ALL_OPEN_JOB_AUDIT_MULTI_SELECT = `V504 changes only Cross Check / Audit Missing filter UX and query semantics. Planning Board, Job, Part, Revision, Program, Next Operation, Last Operation, Current Main, Board Status, Chain, Import and Reason use multi-select unique-value lists sourced from the full open-job audit population; blank source values are available as (Trống). Multiple selections within one column use OR semantics, while selections across columns continue to use AND semantics. WIP Qty and Surface dm² also use exact-value multi-select lists. Audit population, YES/NO classification, missing reasons, Planning Chain, Recipe, Batch, Schedule and Auto Planning are unchanged.`;

