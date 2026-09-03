export type StLogicSection={key:string;title:string;content:string};

export const ST_AI_KNOWLEDGE_VERSION="V414";

export const ST_AI_LOGIC_SECTIONS:StLogicSection[]=[
 {
  key:"canonical-flow",
  title:"Canonical ST Planning flow",
  content:`Import Master Data -> Import All Open Job snapshot -> ST Scope visibility -> ST Operation Mapping -> Main Operation -> Planning Chain -> Planning Board creates/updates Batch -> Scheduling Board assigns the existing Batch to Resource/Date/Start/Duration -> Production Execution reports WAITING/ON-GOING/DONE separately -> Dashboard/AI analyzes read-only operational data. Job Tracker and Part Tracker are read-only trace views.`
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
  content:`Planning Chain workload remains based on Current Main and excludes ST_SCOPE_ONLY from Planning/Batch/Schedule. Dashboard chart 2 (Surface + Qty by Main / Immediate / ST Only) is a read-only current-position view with a broader ST visibility population: direct active PLANNING_OPERATION resolved to Current Main; active auto Bridge INTERMEDIATE validated by LastOperation -> RAW NextOperation -> Current Main; and active ST_SCOPE_ONLY shown as ST_SCOPE_ONLY / RAW NextOperation without creating Planning Chain rows. Auto Intermediate is derived from md_intermediate_bridge_segment + md_intermediate_bridge_operation, not from legacy md_st_operation_scope INTERMEDIATE rows. Unrelated non-ST flows remain excluded.`
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
  content:`Planning Board creates and owns Batch membership. Scheduling Board never recreates the Batch; it assigns an existing unscheduled Batch to a Schedule Area/Resource/Date/Start/Duration. Manual and future Auto Plan/Auto Batch/Auto Schedule share the same Batch/Schedule data model.`
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
  content:`Masking and Unmasking are derived support work from detailed physical routing around the related Main Planning Batch. Production Execution may show their Job-level details, but they do not replace the Main Planning Chain or create a separate Main Batch flow.`
 },
 {
  key:"production-execution",
  title:"Production Execution",
  content:`Production Execution reads scheduled production plus derived Masking/Unmasking work. WAITING/ON-GOING/DONE and Actual Start/End are execution-report facts and are intentionally independent from Planning Chain and planning_schedule status.`
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
