// =====================================================================
// Batch Key / Recipe Rule Engine — dùng chung cho mọi Main Operation.
//
// Nguồn dữ liệu gốc: All Open Job (open_job_current.source_data JSONB).
// Mỗi rule:
//   standard_operation + match_mode(ALL/ANY) + conditions(cột+toán tử+giá trị)
//   → suggested_recipe_key + batch_key_template + batch_no_prefix + priority
//
// Batch Key = khóa gom lô (template có thể chứa {COLUMN} để thay bằng giá trị
// thật của Job). Batch No Prefix = 3 ký tự sinh số lô XXX_DDMMM_NNN.
// Khi nhiều rule cùng ưu tiên khớp với recipe khác nhau → AMBIGUOUS,
// planner phải tự chọn (không tự chọn bừa).
// =====================================================================

export type BatchKeyRuleCondition={
  id:number;
  source_column:string;
  operator:"equals"|"contains"|"not_empty"|"is_empty"|"starts_with"|"ends_with";
  source_value:string|null;
  is_active:boolean;
};

const str=(v:unknown):string=>v==null?"":String(v);

export function matchCondition(cond:BatchKeyRuleCondition,sourceData:Record<string,unknown>|null|undefined):boolean{
  const val=str(sourceData?.[cond.source_column]);
  const expect=str(cond.source_value);
  switch(cond.operator){
    case "not_empty": return val.trim()!=="";
    case "is_empty": return val.trim()==="";
    case "equals": return val===expect;
    case "contains": return val.toLowerCase().includes(expect.toLowerCase());
    case "starts_with": return val.toLowerCase().startsWith(expect.toLowerCase());
    case "ends_with": return val.toLowerCase().endsWith(expect.toLowerCase());
    default: return false;
  }
}


// =====================================================================
// v262/v264/v266: TỰ CHỌN Recipe khi 1 Operation Code có NHIỀU Recipe.
// Thứ tự (đã chốt với user): ĐIỀU KIỆN của Job → Ưu tiên (số nhỏ) → Mặc định → cập nhật cũ.
// v266: GỘP Rule vào mapping — mỗi mapping mang theo batch_key_template +
// batch_no_prefix (trước đây nằm ở màn hình Batch Key / Recipe Rules).
// =====================================================================
export type RecipeCandidateItem={
  mapping_id?:number|null;
  recipe_key:string;
  priority?:number|null;
  is_default?:boolean|null;
  updated_at?:string|number|Date|null;
  selection_rule?:string|null;
  batch_key_template?:string|null;
  batch_no_prefix?:string|null;
};

export function pickBestRecipe(items:RecipeCandidateItem[]|null|undefined):string|null{
  if(!items||!items.length)return null;
  const sorted=[...items].sort((a,b)=>{
    const pa=a.priority==null?Number.MAX_SAFE_INTEGER:Number(a.priority);
    const pb=b.priority==null?Number.MAX_SAFE_INTEGER:Number(b.priority);
    if(pa!==pb)return pa-pb;

    const da=a.is_default?1:0;
    const db=b.is_default?1:0;
    if(da!==db)return db-da;

    const ua=String(a.updated_at??"");
    const ub=String(b.updated_at??"");
    if(ua!==ub)return ua<ub?-1:1;

    return String(a.recipe_key).localeCompare(String(b.recipe_key));
  });
  return sorted[0].recipe_key;
}

// Giải mã selection_rule (JSON conditions) của mapping recipe.
// v277: chấp nhận CẢ format cũ {column,value} lẫn format chuẩn
// {source_column,source_value} — các mapping lỡ lưu bằng form bị lệch key
// (trước v277) tự hiển thị + hoạt động lại mà không cần sửa tay trong DB.
export function parseSelectionRule(json:string|null|undefined):BatchKeyRuleCondition[]{
  if(!json)return [];
  try{
    const arr=JSON.parse(json);
    if(!Array.isArray(arr))return [];
    const operators=new Set<BatchKeyRuleCondition["operator"]>([
      "equals","contains","not_empty","is_empty","starts_with","ends_with"
    ]);
    return arr
      .map((x:any)=>({
        id:Number(x?.id)||0,
        source_column:String(x?.source_column??x?.column??"").trim(),
        operator:operators.has(x?.operator) ? x.operator as BatchKeyRuleCondition["operator"] : "equals",
        source_value:(x?.source_value??x?.value)==null?null:String(x?.source_value??x?.value),
        is_active:x?.is_active!==false
      }))
      .filter(c=>c.source_column);
  }catch{
    return [];
  }
}

/**
 * Validates then rewrites a selection_rule into the single canonical JSON shape.
 * Old `{column,value}` inputs remain accepted, but nothing new is persisted in
 * that legacy shape. Invalid JSON is rejected rather than silently becoming
 * "Không lọc".
 */
export function canonicalizeSelectionRule(json:unknown):string|null{
  if(json==null || String(json).trim()==="")return null;
  let raw:unknown;
  try{raw=typeof json==="string"?JSON.parse(json):json;}catch{
    throw new Error("Điều kiện áp dụng cho Job không phải JSON hợp lệ.");
  }
  if(!Array.isArray(raw))throw new Error("Điều kiện áp dụng cho Job phải là danh sách điều kiện.");
  if(raw.length>8)throw new Error("Chỉ được khai báo tối đa 8 điều kiện áp dụng cho Job.");
  const parsed=parseSelectionRule(JSON.stringify(raw));
  if(parsed.length!==raw.length)throw new Error("Mỗi điều kiện phải có tên cột hợp lệ.");
  return parsed.length?JSON.stringify(parsed.map(({id,...condition})=>condition)):null;
}

/**
 * v264: chọn recipe "đúng nhất" cho 1 Job cụ thể.
 * Ưu tiên: (1) recipe có ĐIỀU KIỆN khớp Job — chọn theo priority/is_default/updated_at;
 *          (2) nếu không có recipe điều kiện nào khớp → recipe không điều kiện
 *              (fallback) — chọn theo priority/is_default/updated_at.
 * Mapping có điều kiện nhưng KHÔNG khớp → bỏ qua (không dùng cho Job này).
 */
// v362: Paint recipe rules are occurrence-aware. A raw Operation Code such as
// SIPT may serve PRIMER1, PRIMER2 and PRIMER3 in different positions of the
// routing. A rule whose paint-specific condition points to PRIMER2 must never
// compete while resolving the PRIMER1 target, even when the Job happens to
// contain both PRIMER1 and PRIMER2 values. Generic conditions (Program, Group,
// Category, ...) remain valid for every occurrence.
export type PaintRecipeOccurrence=
  |"PRIMER1"|"PRIMER2"|"PRIMER3"
  |"TOPCOAT1"|"TOPCOAT2";

export function paintRecipeOccurrenceForStandardOperation(value:unknown):PaintRecipeOccurrence|null{
  const op=String(value??"").trim().toUpperCase();
  if(op==="PRIMER"||op==="PRIMER1")return "PRIMER1";
  if(op==="PRIMER2")return "PRIMER2";
  if(op==="PRIMER3")return "PRIMER3";
  if(op==="TOPCOAT1")return "TOPCOAT1";
  if(op==="TOPCOAT2")return "TOPCOAT2";
  return null;
}

export function paintRecipeOccurrenceForConditionColumn(value:unknown):PaintRecipeOccurrence|null{
  const col=String(value??"").trim().toUpperCase();
  if(!col)return null;
  // Accept real source-column spellings such as:
  //   Part_Masterlist.PRIMER2, Part Master PRIMER2, MD:PRIMER1_NAME.
  // Require a numeric occurrence so generic columns containing the word
  // "PRIMER" / "TOPCOAT" are not accidentally scoped.
  const primer=col.match(/(?:^|[^A-Z0-9])PRIMER[^A-Z0-9]*([123])(?:[^0-9]|$)/);
  if(primer)return `PRIMER${primer[1]}` as PaintRecipeOccurrence;
  const topcoat=col.match(/(?:^|[^A-Z0-9])TOPCOAT[^A-Z0-9]*([12])(?:[^0-9]|$)/);
  if(topcoat)return `TOPCOAT${topcoat[1]}` as PaintRecipeOccurrence;
  return null;
}

export function selectionRuleMatchesPaintOccurrence(
  selectionRule:string|null|undefined,
  standardOperation:unknown
):boolean{
  const target=paintRecipeOccurrenceForStandardOperation(standardOperation);
  if(!target)return true;
  const scoped=parseSelectionRule(selectionRule)
    .map(c=>paintRecipeOccurrenceForConditionColumn(c.source_column))
    .filter((x):x is PaintRecipeOccurrence=>x!==null);
  if(!scoped.length)return true;
  return scoped.every(x=>x===target);
}

export function pickBestRecipeForJob(
  items:RecipeCandidateItem[]|null|undefined,
  sourceData:Record<string,unknown>|null|undefined,
  standardOperation?:string|null
):string|null{
  if(!items||!items.length)return null;
  const hasConditions=(item:RecipeCandidateItem)=>
    parseSelectionRule(item.selection_rule).length>0;

  const eligible=items.filter(item=>{
    if(!selectionRuleMatchesPaintOccurrence(item.selection_rule,standardOperation))return false;
    const conds=parseSelectionRule(item.selection_rule);
    if(!conds.length)return true; // không điều kiện → luôn hợp lệ (fallback)
    return conds.every(c=>matchCondition(c,sourceData));
  });

  const conditional=eligible.filter(hasConditions);
  const unconditional=eligible.filter(item=>!hasConditions(item));

  return pickBestRecipe(conditional.length?conditional:unconditional);
}

// Chuyển hàng SQL md_main_operation_recipe thành RecipeCandidateItem[].
export function toRecipeCandidates(rows:any[]):RecipeCandidateItem[]{
  return (rows||[]).map(r=>({
    mapping_id:r.mapping_id==null?null:Number(r.mapping_id),
    recipe_key:String(r.recipe_key),
    priority:r.priority==null?null:Number(r.priority),
    is_default:!!r.is_default,
    updated_at:r.updated_at,
    selection_rule:r.selection_rule?String(r.selection_rule):null,
    batch_key_template:r.batch_key_template?String(r.batch_key_template):null,
    batch_no_prefix:r.batch_no_prefix?String(r.batch_no_prefix):null
  }));
}

// Chuyển hàng SQL md_main_operation_recipe thành Map<operation_code, items>.
export function groupRecipeCandidates(
  rows:any[],
  codeColumn:string="operation_code"
):Map<string,RecipeCandidateItem[]>{
  const map=new Map<string,RecipeCandidateItem[]>();
  for(const r of rows||[]){
    const k=String(r[codeColumn]??"").trim().toUpperCase();
    if(!k)continue;
    const arr=map.get(k)||[];
    arr.push({
      mapping_id:r.mapping_id==null?null:Number(r.mapping_id),
      recipe_key:String(r.recipe_key),
      priority:r.priority==null?null:Number(r.priority),
      is_default:!!r.is_default,
      updated_at:r.updated_at,
      selection_rule:r.selection_rule?String(r.selection_rule):null,
      batch_key_template:r.batch_key_template?String(r.batch_key_template):null,
      batch_no_prefix:r.batch_no_prefix?String(r.batch_no_prefix):null
    });
    map.set(k,arr);
  }
  return map;
}

// Thay {COLUMN_NAME} trong template bằng giá trị thật của Job.
export function substituteTemplate(
  template:string|null,
  sourceData:Record<string,unknown>|null|undefined
):string|null{
  if(!template)return null;
  const out=template.replace(/\{([^}]+)\}/g,(_,col:string)=>{
    const v=sourceData?.[col];
    return v==null?"":String(v);
  }).trim();
  return out||null;
}


