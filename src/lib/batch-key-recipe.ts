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
  operator:"equals"|"contains"|"not_empty"|"starts_with"|"ends_with";
  source_value:string|null;
  is_active:boolean;
};

export type BatchKeyRule={
  id:number;
  rule_name:string;
  standard_operation:string;
  match_mode:"ALL"|"ANY";
  priority:number;
  suggested_recipe_key:string|null;
  batch_key_template:string|null;
  batch_no_prefix:string|null;
  is_active:boolean;
  note:string|null;
  conditions:BatchKeyRuleCondition[];
};

export type RuleSuggestion={
  matched:boolean;
  ambiguous:boolean;
  rule:BatchKeyRule|null;
  recipeKey:string|null;
  batchKey:string|null;
  prefix:string|null;
};

const str=(v:unknown):string=>v==null?"":String(v);

function matchCondition(cond:BatchKeyRuleCondition,sourceData:Record<string,unknown>|null|undefined):boolean{
  const val=str(sourceData?.[cond.source_column]);
  const expect=str(cond.source_value);
  switch(cond.operator){
    case "not_empty": return val.trim()!=="";
    case "equals": return val===expect;
    case "contains": return val.toLowerCase().includes(expect.toLowerCase());
    case "starts_with": return val.toLowerCase().startsWith(expect.toLowerCase());
    case "ends_with": return val.toLowerCase().endsWith(expect.toLowerCase());
    default: return false;
  }
}

export function ruleMatches(rule:BatchKeyRule,sourceData:Record<string,unknown>|null|undefined):boolean{
  const conds=(rule.conditions||[]).filter(c=>c.is_active!==false);
  if(!conds.length)return false; // rule không có điều kiện thì không tự khớp
  const results=conds.map(c=>matchCondition(c,sourceData));
  return rule.match_mode==="ALL"?results.every(Boolean):results.some(Boolean);
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

export function evaluateRulesForJob(
  rules:BatchKeyRule[],
  standardOperation:string,
  sourceData:Record<string,unknown>|null|undefined
):RuleSuggestion{
  const candidates=(rules||[])
    .filter(r=>r.is_active!==false && r.standard_operation===standardOperation && ruleMatches(r,sourceData));

  if(!candidates.length)
    return {matched:false,ambiguous:false,rule:null,recipeKey:null,batchKey:null,prefix:null};

  // Ưu tiên nhỏ chạy trước → rule cụ thể (nhiều điều kiện) trước → id ổn định.
  candidates.sort((a,b)=>
    (a.priority-b.priority) ||
    ((b.conditions||[]).length-(a.conditions||[]).length) ||
    (a.id-b.id)
  );

  const top=candidates[0];
  const sameRank=candidates.filter(r=>
    r.priority===top.priority &&
    (r.conditions||[]).length===(top.conditions||[]).length
  );
  const distinctRecipes=new Set(sameRank.map(r=>r.suggested_recipe_key||"")).size;

  if(sameRank.length>1 && distinctRecipes>1){
    // Nhiều rule cùng ưu tiên đề xuất recipe khác nhau → báo AMBIGUOUS.
    return {matched:true,ambiguous:true,rule:null,recipeKey:null,batchKey:null,prefix:null};
  }

  return {
    matched:true,
    ambiguous:false,
    rule:top,
    recipeKey:top.suggested_recipe_key||null,
    batchKey:substituteTemplate(top.batch_key_template,sourceData),
    prefix:top.batch_no_prefix||null
  };
}

// Chuyển hàng SQL (jsonb_agg conditions) thành BatchKeyRule[].
export function parseRules(rows:any[]):BatchKeyRule[]{
  return (rows||[]).map(r=>({
    id:Number(r.id),
    rule_name:str(r.rule_name),
    standard_operation:str(r.standard_operation),
    match_mode:String(r.match_mode||"ALL").toUpperCase()==="ANY"?"ANY":"ALL",
    priority:Number(r.priority||100),
    suggested_recipe_key:r.suggested_recipe_key?str(r.suggested_recipe_key):null,
    batch_key_template:r.batch_key_template?str(r.batch_key_template):null,
    batch_no_prefix:r.batch_no_prefix?str(r.batch_no_prefix):null,
    is_active:r.is_active!==false,
    note:r.note?str(r.note):null,
    conditions:Array.isArray(r.conditions)
      ? r.conditions.map((x:any)=>({
          id:Number(x.id),
          source_column:str(x.source_column),
          operator:(x.operator as any)||"equals",
          source_value:x.source_value==null?null:str(x.source_value),
          is_active:x.is_active!==false
        }))
      : []
  }));
}

// Câu SQL chuẩn lấy rule + conditions (dùng cho API và trang Planning).
export const RULES_SQL=`
  select
    r.id,r.rule_name,r.standard_operation,r.match_mode,r.priority,
    r.suggested_recipe_key,r.batch_key_template,r.batch_no_prefix,r.is_active,r.note,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id',c.id,
        'source_column',c.source_column,
        'operator',c.operator,
        'source_value',c.source_value,
        'is_active',c.is_active
      )
      order by c.id
    ) filter (where c.id is not null),'[]'::jsonb) conditions
  from md_batch_key_recipe_rule r
  left join md_batch_key_recipe_rule_condition c
    on c.rule_id=r.id
   and c.is_active=true
  where r.is_active=true
  group by r.id
  order by r.standard_operation,r.priority,r.id
`;
