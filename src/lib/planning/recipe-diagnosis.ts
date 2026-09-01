import type{PoolClient}from"pg";
import{loadLiveRecipeContext,bestRecipeMatch,mergeJobData,type LiveRecipeContext,PAINT_STANDARD_OPS}from"@/lib/planning/live-recipe";
import{parseSelectionRule,matchCondition}from"@/lib/batch-key-recipe";

const clean=(v:unknown)=>String(v??"").trim();
const up=(v:unknown)=>clean(v).toUpperCase();

export type RecipeDiagnosisStep={
 step:number;
 title:string;
 result:"ok"|"fail"|"info"|"skip";
 detail:string;
};

export type RecipeDiagnosis={
 kind:
  |"FOUND_OPERATION_MAPPING"
  |"FOUND_PART_FALLBACK"
  |"NO_OPERATION_MAPPING"
  |"MAPPING_BUT_NO_MATCHING_CONDITION"
  |"MAPPING_INACTIVE"
  |"RECIPE_INACTIVE"
  |"PAINT_NO_PART_RECIPE"
  |"PAINT_NO_OPERATION_NO_PART";
 jobSummary:string;
 conclusion:string;
 action:string;
 actionHref:string;
 steps:RecipeDiagnosisStep[];
 matchedRecipe?:{recipe_mapping_id:number|null;recipe_key:string;recipe_no:string|null;recipe_name:string|null;selection_rule:string|null}|null;
 candidates?:{
  recipe_mapping_id:number|null;
  recipe_key:string;
  recipe_no:string|null;
  recipe_name:string|null;
  priority:number|null;
  is_default:boolean;
  selection_rule:string|null;
  matches:boolean;
  mismatchedConditions?:string[];
 }[];
};

function describeCondition(c:{source_column:string;operator:string;source_value:string|null}){
 const op=c.operator==="equals"?"="
  :c.operator==="contains"?"chứa"
  :c.operator==="starts_with"?"bắt đầu bằng"
  :c.operator==="ends_with"?"kết thúc bằng"
  :c.operator==="not_empty"?"không trống"
  :c.operator==="is_empty"?"trống"
  :c.operator;
 const col=c.source_column;
 const val=c.source_value==null||c.source_value===""?"":` "${c.source_value}"`;
 return `${col} ${op}${val}`;
}

/**
 * Chẩn đoán 1 Job: vì sao chưa có Recipe theo cấu hình hiện tại.
 * Dùng cùng dữ liệu với engine live-recipe (bestRecipeMatch) nhưng
 * ghi lại từng bước để giải thích cho user.
 */
export async function diagnoseJobRecipe(
 c:PoolClient,
 args:{
  sourceOperationCode:string;
  standardOperation:string;
  partNum:string|null;
  revisionNum:string|null;
  sourceData:Record<string,unknown>|null;
 }
):Promise<RecipeDiagnosis>{
 const ctx=await loadLiveRecipeContext(c);
 const match=bestRecipeMatch(ctx,{
  standardOperation:args.standardOperation,
  sourceOperationCode:args.sourceOperationCode,
  partNum:args.partNum,
  revisionNum:args.revisionNum,
  sourceData:args.sourceData||null,
  ruleSuggestion:null
 });

 const data=mergeJobData(ctx,{partNum:args.partNum,revisionNum:args.revisionNum,sourceData:args.sourceData||null});
 const srcOp=up(args.sourceOperationCode);
 const stdOp=up(args.standardOperation);
 const isPaint=PAINT_STANDARD_OPS.has(stdOp);

 const opCode=clean(args.sourceOperationCode)||"—";
 const stdLabel=clean(args.standardOperation)||"—";
 const partLabel=args.partNum?`${args.partNum}${args.revisionNum?` Rev ${args.revisionNum}`:""}`:"(chưa có Part)";
 const jobSummary=`${opCode} · ${stdLabel} · Part ${partLabel}`;
 const actionHref=`/recipe-operation-map?op=${encodeURIComponent(clean(args.sourceOperationCode))}`;
 const steps:RecipeDiagnosisStep[]=[];

 const list=ctx.mainOpRecipeMap.get(srcOp)||[];

 // Bước 1: có mapping Operation Code → Recipe đang hoạt động không?
 steps.push({
  step:1,
  title:`Tìm mapping Operation Code “${opCode}” → Recipe`,
  result:list.length?"ok":"fail",
  detail:list.length
   ?`Có ${list.length} mapping đang hoạt động cho mã này.`
   :`Chưa có mapping nào cho “${opCode}” trong Công thức & Rule (phần ① Công đoạn → Recipe).`
 });

 if(match.recipeKey){
  // Có recipe → trả về FOUND (không nên xảy ra khi user thấy "chưa có" nhưng an toàn).
  const paintFallback=isPaint&&list.every(x=>x.recipe_key!==match.recipeKey);
  steps.push({
   step:2,
   title:"Kết quả",
   result:"ok",
   detail:paintFallback
    ?`Đã tìm thấy Recipe theo Part + Revision (fallback sơn).`
    :`Đã match Recipe Rule #${match.recipeMappingId||"—"} theo mapping Operation Code.`
  });
  const metaQ=await c.query(`select recipe_no,recipe_name from md_process_recipe where recipe_key=$1 limit 1`,[match.recipeKey]);
  const matchedRule=match.recipeMappingId
   ?list.find(x=>Number(x.mapping_id||0)===Number(match.recipeMappingId))||null
   :null;
  return {
   kind:paintFallback?"FOUND_PART_FALLBACK":"FOUND_OPERATION_MAPPING",
   jobSummary,
   conclusion:"Job này ĐÃ có Recipe theo cấu hình hiện tại.",
   action:"Không cần chỉnh sửa. Nếu board vẫn báo thiếu, hãy tải lại trang.",
   actionHref,
   steps,
   matchedRecipe:{
    recipe_mapping_id:match.recipeMappingId,
    recipe_key:match.recipeKey,
    recipe_no:metaQ.rows[0]?.recipe_no||null,
    recipe_name:metaQ.rows[0]?.recipe_name||null,
    selection_rule:matchedRule?.selection_rule||null
   }
  };
 }

 // Không có recipe → chẩn đoán nguyên nhân.
 if(list.length){
  // Có mapping nhưng không mapping nào khớp điều kiện của Job.
  const evaluated=list.map(item=>{
   const conds=parseSelectionRule(item.selection_rule);
   if(!conds.length)return{recipe_mapping_id:item.mapping_id??null,recipe_key:item.recipe_key,priority:item.priority,is_default:item.is_default,selection_rule:item.selection_rule,matches:true,mismatchedConditions:[] as string[]};
   const mismatched=conds.filter(c=>!matchCondition(c,data)).map(c=>{
    const actual=clean(data?.[c.source_column]);
    return `${describeCondition(c)} — job đang là "${actual||"(trống)"}"`;
   });
   return{recipe_mapping_id:item.mapping_id??null,recipe_key:item.recipe_key,priority:item.priority,is_default:item.is_default,selection_rule:item.selection_rule,matches:mismatched.length===0,mismatchedConditions:mismatched};
  });
  const anyMatched=evaluated.some(x=>x.matches);
  if(anyMatched){
   // Có mapping khớp điều kiện nhưng engine không chọn → có thể recipe bị ngưng dùng.
   const keys=evaluated.filter(x=>x.matches).map(x=>x.recipe_key);
   const inactiveQ=await c.query(`
     select recipe_key from md_process_recipe
     where recipe_key=any($1::text[]) and is_active=false
   `,[keys]);
   if(inactiveQ.rowCount){
    steps.push({step:2,title:"Kiểm tra Recipe",result:"fail",detail:`Có ${inactiveQ.rowCount} Recipe được mapping nhưng đã NGƯNG DÙNG trong danh mục Recipe.`});
    return{
     kind:"RECIPE_INACTIVE",
     jobSummary,
     conclusion:`Mapping cho “${opCode}” trỏ tới Recipe đã bị ngưng dùng — hệ thống không dùng recipe đó nên board hiển thị “Chưa có Recipe”.`,
     action:`Mở danh mục Recipe (phần ②), kích hoạt lại recipe, hoặc đổi mapping sang recipe khác.`,
     actionHref,
     steps,
     candidates:await enrichCandidates(c,evaluated)
    };
   }
  }
  steps.push({
   step:2,
   title:"Kiểm tra điều kiện “Áp dụng cho Job”",
   result:evaluated.some(x=>x.mismatchedConditions&&x.mismatchedConditions.length)?"fail":"info",
   detail:evaluated.some(x=>x.mismatchedConditions&&x.mismatchedConditions.length)
    ?"Có mapping nhưng điều kiện không khớp dữ liệu của Job này."
    :"Có mapping nhưng không mapping nào được chọn."
  });
  return{
   kind:"MAPPING_BUT_NO_MATCHING_CONDITION",
   jobSummary,
   conclusion:`“${opCode}” đã được cấu hình Recipe, nhưng KHÔNG có mapping nào khớp điều kiện của Job này (xem chi tiết điều kiện bên dưới).`,
   action:`Sửa điều kiện “Áp dụng cho Job” trong mapping cho “${opCode}”, hoặc thêm một dòng mapping không điều kiện (áp dụng mọi Job).`,
   actionHref,
   steps,
   candidates:await enrichCandidates(c,evaluated)
  };
 }

 // Không có mapping theo Operation Code. Nếu là sơn, kiểm tra fallback Part+Rev.
 if(isPaint){
  const partKey=`${up(args.partNum)}${up(args.revisionNum)}${stdOp}`;
  const hasPartRecipe=ctx.paintRecipeMap.has(partKey);
  steps.push({
   step:2,
   title:`Kiểm tra fallback theo Part + Revision (${partLabel})`,
   result:hasPartRecipe?"info":"fail",
   detail:hasPartRecipe
    ?"Có Recipe theo Part + Revision nhưng không được dùng (bất thường — liên hệ trợ lý)."
    :`Part + Revision của Job chưa được gán Recipe cho “${stdLabel}” trong Master Data.`
  });
  return{
   kind:"PAINT_NO_PART_RECIPE",
   jobSummary,
   conclusion:`Công đoạn sơn “${stdLabel}” chưa có mapping theo Operation Code “${opCode}” VÀ chưa có Recipe theo Part + Revision.`,
   action:`Thêm mapping “${opCode}” → Recipe trong Công thức & Rule (khuyến nghị), hoặc gán Recipe cho Part + Revision trong Master Data.`,
   actionHref,
   steps
  };
 }

 // Không phải sơn, không có mapping → NO_OPERATION_MAPPING.
 steps.push({
  step:2,
  title:"Fallback theo Part + Revision",
  result:"skip",
  detail:"Không áp dụng — chỉ công đoạn sơn mới dùng fallback này."
 });
 return{
  kind:"NO_OPERATION_MAPPING",
  jobSummary,
  conclusion:`Chưa có mapping nào cho Operation Code “${opCode}” — đây là nguyên nhân board hiển thị “Chưa có Recipe”.`,
  action:`Thêm mapping “${opCode}” → Recipe trong Công thức & Rule, phần ① Công đoạn → Recipe.`,
  actionHref,
  steps
 };
}

async function enrichCandidates(
 c:PoolClient,
 evaluated:{recipe_mapping_id?:number|null;recipe_key:string;priority:number|null|undefined;is_default:boolean|null|undefined;selection_rule:string|null|undefined;matches:boolean;mismatchedConditions?:string[]}[]
){
 const keys=evaluated.map(x=>x.recipe_key);
 const q=await c.query(`select recipe_key,recipe_no,recipe_name from md_process_recipe where recipe_key=any($1::text[])`,[keys]);
 const meta=new Map(q.rows.map((r:any)=>[r.recipe_key,{recipe_no:r.recipe_no,recipe_name:r.recipe_name}]));
 return evaluated.map(x=>({
  recipe_mapping_id:x.recipe_mapping_id??null,
  recipe_key:x.recipe_key,
  recipe_no:meta.get(x.recipe_key)?.recipe_no||null,
  recipe_name:meta.get(x.recipe_key)?.recipe_name||null,
  priority:x.priority??null,
  is_default:Boolean(x.is_default),
  selection_rule:x.selection_rule??null,
  matches:x.matches,
  mismatchedConditions:x.mismatchedConditions||[]
 }));
}

// =====================================================================
// SO SÁNH CẤU HÌNH ↔ BOARD
// =====================================================================

export type ConfigBoardComparison={
 boardNeeds:{
  source_operation_code:string;
  standard_operation:string|null;
  waiting_jobs:number;
  sample_jobs:string[];
  config_found:boolean;
  config_note:string;
 }[];
 configUnused:{
  operation_code:string;
  recipe_key:string;
  recipe_no:string|null;
  recipe_name:string|null;
  issue:string;
 }[];
};

/**
 * So sánh cấu hình Recipe (Công thức & Rule + Main Op → Recipe reference)
 * với nhu cầu thực tế trên Planning Board (các Job ELIGIBLE đang chờ).
 */
export async function loadRecipeComparison(c:PoolClient):Promise<ConfigBoardComparison>{
 // 1) Operation Code mà board đang cần (ELIGIBLE, còn mở).
 const boardQ=await c.query(`
   select
    upper(trim(p.source_operation_code)) op,
    p.standard_operation,
    count(*)::int waiting_jobs,
    (array_agg(p.job_num order by p.job_num))[1:5] sample_jobs
   from planning_job_operation p
   join open_job_current j on j.job_num=p.job_num and j.is_open=true
   where p.is_active=true and p.status='ELIGIBLE'
   group by upper(trim(p.source_operation_code)),p.standard_operation
   order by waiting_jobs desc,op
 `);

 // 2) Mapping đang hoạt động theo Operation Code.
 const mapQ=await c.query(`
   select upper(trim(operation_code)) op,recipe_key,priority,is_default,selection_rule
   from md_main_operation_recipe
   where is_active=true
 `);
 const mappedOps=new Set(mapQ.rows.map((r:any)=>up(r.op)));

 const boardNeeds=boardQ.rows.map((r:any)=>({
  source_operation_code:r.op,
  standard_operation:r.standard_operation||null,
  waiting_jobs:Number(r.waiting_jobs||0),
  sample_jobs:(r.sample_jobs||[]) as string[],
  config_found:mappedOps.has(up(r.op)),
  config_note:mappedOps.has(up(r.op))
   ?"Đã có mapping theo Operation Code"
   :"Chưa có mapping — job sẽ báo Chưa có Recipe"
 }));

 // 3) Mapping có nhưng board không dùng (không job nào ELIGIBLE có mã đó).
 const boardOpSet=new Set(boardQ.rows.map((r:any)=>up(r.op)));
 const unusedRows=mapQ.rows.filter((r:any)=>!boardOpSet.has(up(r.op)));
 const recipeMetaQ=await c.query(`select recipe_key,recipe_no,recipe_name,is_active from md_process_recipe`);
 const recipeMeta=new Map(recipeMetaQ.rows.map((r:any)=>[r.recipe_key,{recipe_no:r.recipe_no,recipe_name:r.recipe_name,is_active:r.is_active}]));

 const configUnused=unusedRows.map((r:any)=>{
  const meta=recipeMeta.get(r.recipe_key);
  const issue=meta&&!meta.is_active
   ?"Recipe đã ngưng dùng — mapping vô hiệu"
   :"Không có Job ELIGIBLE nào trên board dùng mã này";
  return{
   operation_code:r.op,
   recipe_key:r.recipe_key,
   recipe_no:meta?.recipe_no||null,
   recipe_name:meta?.recipe_name||null,
   issue
  };
 });

 // 4) Mapping reference (Main Op → Recipe cũ) còn tồn tại — cảnh báo v280 không còn dùng.
 const refQ=await c.query(`
   select standard_operation,count(*)::int n
   from md_operation_recipe_mapping where is_active=true
   group by standard_operation order by standard_operation
 `);
 if(refQ.rows.length){
  // Chỉ thêm 1 dòng cảnh báo tổng (không lặp theo từng op để không tràn UI).
  const total=refQ.rows.reduce((a:number,r:any)=>a+Number(r.n||0),0);
  configUnused.unshift({
   operation_code:"(bảng reference cũ)",
   recipe_key:`${total} mapping`,
   recipe_no:null,
   recipe_name:"Main Op → Recipe (Master Data)",
   issue:`Từ v280 bảng này chỉ để đối chiếu, KHÔNG điều khiển đề xuất Recipe trên board. Tạo lại trong Công thức & Rule.`
  });
 }

 return{boardNeeds,configUnused};
}
