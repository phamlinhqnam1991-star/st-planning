// =====================================================================
// v262: Recipe theo CẤU HÌNH HIỆN TẠI (live) — hiển thị trên Planning Board
// mà KHÔNG cần bấm Rebuild Chain. Cùng thứ tự ưu tiên với
// sync-planning-chains (nguồn khi Rebuild):
//   1) Main Operation · Operation Code → Recipe (md_main_operation_recipe)
//      cho MỌI công đoạn, tự chọn theo điều kiện → priority → is_default → updated_at.
//   2) Part + Revision → Recipe (md_part_process_recipe) chỉ là fallback,
//      chủ yếu dùng cho công đoạn sơn khi Operation Code chưa có mapping phù hợp.
// =====================================================================
import {matchCondition,parseSelectionRule,toRecipeCandidates,type RecipeCandidateItem} from "@/lib/batch-key-recipe";

export const PAINT_STANDARD_OPS=new Set([
  "PRIMER","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2","ANTI-ABRASION","VARNISH"
]);

const clean=(v:unknown)=>String(v??"").trim();
const up=(v:unknown)=>clean(v).toUpperCase();

export type LiveRecipeContext={
  /** operation_code (hoa) → danh sách recipe active của mã công đoạn đó */
  mainOpRecipeMap:Map<string,RecipeCandidateItem[]>;
  /** PART|REV|STD_OP (hoa) → recipe_key theo Part (md_part_process_recipe) */
  paintRecipeMap:Map<string,string>;
  /** PART\u0001REV (hoa) → cột MASTER DATA (MD:...) theo Part+Revision */
  masterByPartRev:Map<string,Record<string,string>>;
};

export async function loadLiveRecipeContext(c:any):Promise<LiveRecipeContext>{
  // v322: md_process_requirement (2.1M rows, ~10s/cold) REMOVED from the recipe
  // context — verified 2026-08-31 that NO selection_rule in md_main_operation_recipe
  // references MD:REQ:* (rules only use AddInfo_*, Part_Masterlist.*, MD:PRIMER1…).
  // sync-planning-chains still loads requirements through its own query path.
  const [m,p,partQ,finishQ,recipeKeyQ]=await Promise.all([
    c.query(`
      select operation_code,recipe_key,priority,is_default,updated_at,selection_rule,
             batch_key_template,batch_no_prefix
      from md_main_operation_recipe
      where is_active=true
        and exists(
          select 1
          from md_process_recipe r
          where r.recipe_key=md_main_operation_recipe.recipe_key
            and r.is_active=true
        )
    `),
    // v322: plain select without the correlated EXISTS (was ~9s over 75k rows);
    // rows whose recipe is not active are filtered in JS via activeRecipeKeys.
    c.query(`
      select part_num,revision_num,standard_operation,recipe_key
      from md_part_process_recipe
      where is_active=true
    `),
    c.query(`
      select part_num,program,part_cluster,part_description,surface_dm2
      from md_part
      where is_active=true
    `),
    c.query(`
      select part_num,revision_num,primer1,primer2,primer3,topcoat1,topcoat2,
             antiabration,primer1_name,topcoat_name,antiabrasion_name,varinish_name,
             alloy,temper,tsa,chemicalconv_airbus
      from md_material_finish
      where is_active=true
    `),
    c.query(`
      select recipe_key
      from md_process_recipe
      where is_active=true
    `)
  ]);

  const activeRecipeKeys=new Set<string>();
  for(const r of recipeKeyQ.rows)activeRecipeKeys.add(String(r.recipe_key));
  const mainOpRecipeMap=groupMainOpRecipes(m.rows);
  const paintRecipeMap=new Map<string,string>();
  for(const r of p.rows){
    if(!activeRecipeKeys.has(String(r.recipe_key)))continue;
    paintRecipeMap.set(
      `${up(r.part_num)}\u0001${up(r.revision_num)}\u0001${up(r.standard_operation)}`,
      String(r.recipe_key)
    );
  }

  // v269: cột MASTER DATA theo Part+Revision (MD:...) — gộp vào dữ liệu job
  // khi khớp điều kiện "Áp dụng cho Job" (All Open Job thiếu dữ liệu vật liệu).
  const masterByPartRev=new Map<string,Record<string,string>>();
  const put=(key:string,field:string,val:unknown)=>{
    if(val==null)return;
    const t=String(val).trim();
    if(!t)return;
    let rec=masterByPartRev.get(key);
    if(!rec){rec={};masterByPartRev.set(key,rec);}
    rec[field]=t;
  };
  for(const r of partQ.rows){
    const k=`${up(r.part_num)}\u0001`;
    put(k,"MD:PROGRAM",r.program);
    put(k,"MD:PART_CLUSTER",r.part_cluster);
    put(k,"MD:PART_DESCRIPTION",r.part_description);
    put(k,"MD:SURFACE_DM2",r.surface_dm2);
  }
  for(const r of finishQ.rows){
    const k=`${up(r.part_num)}\u0001${up(r.revision_num)}`;
    put(k,"MD:ALLOY",r.alloy);
    put(k,"MD:TEMPER",r.temper);
    put(k,"MD:TSA",r.tsa);
    put(k,"MD:CHEMCONV_AIRBUS",r.chemicalconv_airbus);
    put(k,"MD:PRIMER1",r.primer1);
    put(k,"MD:PRIMER2",r.primer2);
    put(k,"MD:PRIMER3",r.primer3);
    put(k,"MD:TOPCOAT1",r.topcoat1);
    put(k,"MD:TOPCOAT2",r.topcoat2);
    put(k,"MD:ANTIABRASION",r.antiabration);
    put(k,"MD:PRIMER1_NAME",r.primer1_name);
    put(k,"MD:TOPCOAT_NAME",r.topcoat_name);
    put(k,"MD:ANTIABRASION_NAME",r.antiabrasion_name);
    put(k,"MD:VARINISH_NAME",r.varinish_name);
  }

  return {mainOpRecipeMap,paintRecipeMap,masterByPartRev};
}

// v269: dữ liệu job để khớp điều kiện = All Open Job + cột MASTER DATA (MD:...)
// theo Part+Revision. Master thắng nếu trùng tên (hiếm — đều có tiền tố MD:).
export function mergeJobData(
  ctx:LiveRecipeContext,
  args:{partNum?:string|null;revisionNum?:string|null;sourceData?:Record<string,unknown>|null}
):Record<string,unknown>{
  const master=ctx.masterByPartRev.get(`${up(args.partNum)}\u0001${up(args.revisionNum)}`);
  return master?{...(args.sourceData||{}),...master}:{...(args.sourceData||{})};
}

export function groupMainOpRecipes(rows:any[]):Map<string,RecipeCandidateItem[]>{
  const map=new Map<string,RecipeCandidateItem[]>();
  for(const r of rows||[]){
    const k=up(r.operation_code);
    if(!k)continue;
    map.set(k,(map.get(k)||[]).concat(toRecipeCandidates([r])));
  }
  return map;
}

/**
 * Recipe "đúng theo cấu hình hiện tại" của 1 Job tại 1 công đoạn.
 * Thứ tự: Rule (nếu khớp) → paint theo Part+Rev → Operation Code
 * (chỉ xét mapping khớp ĐIỀU KIỆN của Job, rồi priority → is_default → updated_at).
 * Trả về recipe_key hoặc null (chưa có cấu hình nào khớp).
 */
export function effectiveRecipeKey(
  ctx:LiveRecipeContext,
  args:{
    standardOperation?:string|null;
    sourceOperationCode?:string|null;
    partNum?:string|null;
    revisionNum?:string|null;
    sourceData?:Record<string,unknown>|null;
    ruleSuggestion?:{matched:boolean;ambiguous:boolean;recipeKey:string|null}|null;
  }
):string|null{
  return bestRecipeMatch(ctx,args).recipeKey;
}

/**
 * v266: như effectiveRecipeKey nhưng trả kèm Mã lô mẫu + Prefix số lô của mapping
 * đang thắng (trước đây nằm ở Batch Key / Recipe Rules — nay gộp vào mapping).
 */
export function bestRecipeMatch(
  ctx:LiveRecipeContext,
  args:{
    standardOperation?:string|null;
    sourceOperationCode?:string|null;
    partNum?:string|null;
    revisionNum?:string|null;
    sourceData?:Record<string,unknown>|null;
    ruleSuggestion?:{matched:boolean;ambiguous:boolean;recipeKey:string|null}|null;
  }
):{recipeKey:string|null;batchKeyTemplate:string|null;batchNoPrefix:string|null}{
  // v280: Main Operation · Operation Code là nguồn ƯU TIÊN cho MỌI công đoạn,
  // kể cả sơn. Part + Revision chỉ được dùng khi Operation Code chưa có mapping
  // phù hợp điều kiện Job. Nhờ đó cấu hình ở trang "Công thức & Rule" luôn là
  // nguồn điều khiển chính và không bị Master Data tự ghi đè.
  const data=mergeJobData(ctx,args);
  const list=ctx.mainOpRecipeMap.get(up(args.sourceOperationCode));
  const best=pickBestRecipeForJobItem(list,data);
  if(best){
    return {
      recipeKey:best.recipe_key,
      batchKeyTemplate:best.batch_key_template||null,
      batchNoPrefix:best.batch_no_prefix||null
    };
  }

  const stdOp=up(args.standardOperation);
  if(PAINT_STANDARD_OPS.has(stdOp)){
    const fallback=ctx.paintRecipeMap.get(`${up(args.partNum)}\u0001${up(args.revisionNum)}\u0001${stdOp}`)||null;
    return {recipeKey:fallback,batchKeyTemplate:null,batchNoPrefix:null};
  }
  return {recipeKey:null,batchKeyTemplate:null,batchNoPrefix:null};
}

// Chọn item mapping "đang thắng" (điều kiện khớp → ưu tiên), trả về item đầy đủ.
function pickBestRecipeForJobItem(
  items:RecipeCandidateItem[]|null|undefined,
  sourceData:Record<string,unknown>|null
):RecipeCandidateItem|null{
  if(!items||!items.length)return null;
  const eligible=items.filter(item=>{
    const conds=parseSelectionRule(item.selection_rule);
    if(!conds.length)return true;
    return conds.every(c=>matchCondition(c,sourceData));
  });
  if(!eligible.length)return null;
  const sorted=[...eligible].sort((a,b)=>{
    const pa=a.priority==null?Number.MAX_SAFE_INTEGER:Number(a.priority);
    const pb=b.priority==null?Number.MAX_SAFE_INTEGER:Number(b.priority);
    if(pa!==pb)return pa-pb;
    const da=a.is_default?1:0,db=b.is_default?1:0;
    if(da!==db)return db-da;
    const ua=String(a.updated_at??""),ub=String(b.updated_at??"");
    if(ua!==ub)return ua<ub?-1:1;
    return String(a.recipe_key).localeCompare(String(b.recipe_key));
  });
  return sorted[0];
}
