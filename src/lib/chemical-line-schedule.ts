export const CHEMICAL_NDT_DURATION_MINUTES=5*60;
export const CHEMICAL_NDT_START_GAP_MINUTES=90;
export const PRECLEAN_RECIPE_NOS=new Set(["001","009","016","025"]);

export type ChemicalHandlingPhase="LOADING"|"UNLOADING";

export type ChemicalHandlingRule={
 id:number;
 phase:ChemicalHandlingPhase;
 priority:number;
 qty_min:number|null;
 qty_max:number|null;
 surface_min_dm2:number|null;
 surface_max_dm2:number|null;
 duration_minutes:number;
 note?:string|null;
};

export type ChemicalScheduleWindow={
 loadingStart:Date;
 loadingEnd:Date;
 loadingMinutes:number;
 processStart:Date;
 processEnd:Date;
 processMinutes:number;
 ndtStart:Date|null;
 ndtEnd:Date|null;
 ndtMinutes:number|null;
 unloadingStart:Date;
 unloadingEnd:Date;
 unloadingMinutes:number;
 totalMinutes:number;
};

// Planner có thể chủ động chỉnh giờ bắt đầu của Process / NDT / Unloading.
// Loading Start luôn là điểm neo (không override). Giá trị null = tự động.
export type ChemicalScheduleOverrides={
 processStart?:Date|null;
 ndtStart?:Date|null;
 unloadingStart?:Date|null;
 loadingMinutes?:number|null;
};

const finite=(value:unknown)=>{
 const number=Number(value);
 return Number.isFinite(number)?number:0;
};

const addMinutes=(value:Date,minutes:number)=>new Date(value.getTime()+minutes*60000);

export function normalizeChemicalRecipeNo(value:unknown){
 const raw=String(value??"").trim();
 if(/^\d+$/.test(raw))return raw.padStart(3,"0");
 return raw.toUpperCase();
}

export function isPrecleanRecipe(value:unknown){
 return PRECLEAN_RECIPE_NOS.has(normalizeChemicalRecipeNo(value));
}

export function selectChemicalHandlingRule(
 rules:ChemicalHandlingRule[],
 phase:ChemicalHandlingPhase,
 qty:unknown,
 surfaceDm2:unknown
){
 const q=finite(qty);
 const surface=finite(surfaceDm2);

 return [...rules]
  .filter(rule=>
   rule.phase===phase &&
   (rule.qty_min==null||q>=Number(rule.qty_min)) &&
   (rule.qty_max==null||q<=Number(rule.qty_max)) &&
   (rule.surface_min_dm2==null||surface>=Number(rule.surface_min_dm2)) &&
   (rule.surface_max_dm2==null||surface<=Number(rule.surface_max_dm2))
  )
  .sort((a,b)=>Number(a.priority)-Number(b.priority)||Number(a.id)-Number(b.id))[0]||null;
}

export function buildChemicalScheduleWindow({
 loadingStart,
 processMinutes,
 loadingMinutes,
 unloadingMinutes,
 recipeNo,
 previousNdtStart,
 overrides
}:{
 loadingStart:Date;
 processMinutes:number;
 loadingMinutes:number;
 unloadingMinutes:number;
 recipeNo:unknown;
 previousNdtStart?:Date|null;
 overrides?:ChemicalScheduleOverrides|null;
}):ChemicalScheduleWindow{
 const loadingEnd=addMinutes(loadingStart,loadingMinutes);
 const processStart=overrides?.processStart||loadingEnd;
 const processEnd=addMinutes(processStart,processMinutes);
 const preclean=isPrecleanRecipe(recipeNo);
 const minimumNdtStart=previousNdtStart
  ?addMinutes(previousNdtStart,CHEMICAL_NDT_START_GAP_MINUTES)
  :null;
 // Override NDT Start được áp dụng theo đúng giá trị planner nhập;
 // ràng buộc tối thiểu (sau Process End, cách NDT trước ≥ 01:30) được kiểm
 // tra ở tầng server (resolveChemicalScheduleWindow).
 const ndtStart=preclean
  ?(overrides?.ndtStart||new Date(Math.max(processEnd.getTime(),minimumNdtStart?.getTime()||0)))
  :null;
 const ndtEnd=ndtStart?addMinutes(ndtStart,CHEMICAL_NDT_DURATION_MINUTES):null;
 const unloadingStart=overrides?.unloadingStart||ndtEnd||processEnd;
 const unloadingEnd=addMinutes(unloadingStart,unloadingMinutes);

 return {
  loadingStart,
  loadingEnd,
  loadingMinutes,
  processStart,
  processEnd,
  processMinutes,
  ndtStart,
  ndtEnd,
  ndtMinutes:preclean?CHEMICAL_NDT_DURATION_MINUTES:null,
  unloadingStart,
  unloadingEnd,
  unloadingMinutes,
  totalMinutes:Math.round((unloadingEnd.getTime()-loadingStart.getTime())/60000)
 };
}
