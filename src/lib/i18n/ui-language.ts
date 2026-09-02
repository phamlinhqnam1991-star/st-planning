import catalogJson from "./ui-catalog.json";

export type UiLocale="en"|"vi";
export const UI_DEFAULT_LOCALE:UiLocale="en";
export const UI_LANGUAGE_STORAGE_KEY="st_ui_language";
export const UI_LANGUAGE_COOKIE="st_ui_lang";

export type UiCatalogPair={
 en:string;
 vi:string;
 mode?:"exact"|"phrase";
};

const pairs=(catalogJson.pairs as UiCatalogPair[]).filter(x=>x.en&&x.vi);
const exactPairs=pairs.filter(x=>x.mode==="exact");
const phrasePairs=pairs.filter(x=>x.mode!=="exact");

const normalizeExact=(value:string)=>value.replace(/\s+/g," ").trim().toLocaleLowerCase("en-US");
const exactToEn=new Map<string,string>();
const exactToVi=new Map<string,string>();
// Phrase pairs provide fallback exact matches; explicit exact pairs always win.
for(const pair of phrasePairs){
 if(!exactToEn.has(normalizeExact(pair.vi)))exactToEn.set(normalizeExact(pair.vi),pair.en);
 if(!exactToVi.has(normalizeExact(pair.en)))exactToVi.set(normalizeExact(pair.en),pair.vi);
}
for(const pair of exactPairs){
 exactToEn.set(normalizeExact(pair.vi),pair.en);
 exactToVi.set(normalizeExact(pair.en),pair.vi);
}

const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const isWordPhrase=(value:string)=>/^[\p{L}\p{N} _/&-]+$/u.test(value) && !/[→·:()\[\]]/.test(value);

function phraseRegex(source:string){
 const escaped=escapeRegExp(source).replace(/ /g,"\\s+");
 if(isWordPhrase(source))return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,`giu`);
 return new RegExp(escaped,"giu");
}


const PROTECTED_UI_TERMS=[
 "All Open Jobs","Planning Board","Main Operation","Operation Code","ST Group","Schedule Area","Physical Area",
 "Batch Key","Batch No","Recipe","Batch","Job","Part","Planner","Resource","Route Matrix","Planning Chain",
 "NextOperation","LastOperation","LastLaborOp","AllOperation","Process Time","Loading","Unloading","NDT",
 "READY","WAIT","DONE","PLANNED","UNSCHEDULED","SCHEDULED","RUNNING","HOLD","NO CHAIN",
 "ST_SCOPE_ONLY","PLANNING_OPERATION","INTERMEDIATE","AUTO","MANUAL","API","DB","JSON","Excel","Supabase",
 "PRIMER1","PRIMER2","PRIMER3","TOPCOAT1","TOPCOAT2"
].sort((a,b)=>b.length-a.length);

function protectDomainTerms(value:string){
 const protectedValues:string[]=[];
 let out=value;
 for(const term of PROTECTED_UI_TERMS){
  const regex=new RegExp(escapeRegExp(term),"giu");
  out=out.replace(regex,match=>{
   const token=`\uE000${protectedValues.length}\uE001`;
   protectedValues.push(match);
   return token;
  });
 }
 return {
  value:out,
  restore:(translated:string)=>translated.replace(/\uE000(\d+)\uE001/g,(_m,index)=>protectedValues[Number(index)]??_m),
 };
}

type CompiledPhrase={from:string;to:string;regex:RegExp};
const toEnPhrases:CompiledPhrase[]=phrasePairs
 .map(pair=>({from:pair.vi,to:pair.en,regex:phraseRegex(pair.vi)}))
 .sort((a,b)=>b.from.length-a.from.length);
const toViPhrases:CompiledPhrase[]=phrasePairs
 .map(pair=>({from:pair.en,to:pair.vi,regex:phraseRegex(pair.en)}))
 .sort((a,b)=>b.from.length-a.from.length);

function adaptCase(match:string,target:string){
 const letters=match.replace(/[^\p{L}]/gu,"");
 if(letters && letters===letters.toLocaleUpperCase())return target.toLocaleUpperCase();
 if(letters && letters===letters.toLocaleLowerCase()){
  const targetLetters=target.replace(/[^\p{L}]/gu,"");
  if(targetLetters && targetLetters===targetLetters.toLocaleUpperCase())return target;
  return target.length?target[0].toLocaleLowerCase()+target.slice(1):target;
 }
 return target;
}

function preserveOuterWhitespace(original:string,translatedCore:string){
 const leading=original.match(/^\s*/)?.[0]??"";
 const trailing=original.match(/\s*$/)?.[0]??"";
 return `${leading}${translatedCore}${trailing}`;
}


const translationCache=new Map<string,string>();

/**
 * Translate UI-only text. Business/data values are never machine translated;
 * only cataloged exact phrases or known UI phrase fragments are replaced.
 */
export function translateUiText(value:string,locale:UiLocale,options?:{exactOnly?:boolean}){
 if(!value||!value.trim())return value;
 const cacheKey=`${locale}|${options?.exactOnly?1:0}|${value}`;
 const cached=translationCache.get(cacheKey);
 if(cached!==undefined)return cached;
 const core=value.trim();
 const exactMap=locale==="en"?exactToEn:exactToVi;
 const exact=exactMap.get(normalizeExact(core));
 if(exact){const result=preserveOuterWhitespace(value,adaptCase(core,exact));translationCache.set(cacheKey,result);return result;}
 if(options?.exactOnly){translationCache.set(cacheKey,value);return value;}

 const compiled=locale==="en"?toEnPhrases:toViPhrases;
 const protectedText=protectDomainTerms(core);
 let out=protectedText.value;
 for(const p of compiled){
  p.regex.lastIndex=0;
  if(!p.regex.test(out))continue;
  p.regex.lastIndex=0;
  out=out.replace(p.regex,(match)=>adaptCase(match,p.to));
 }
 out=protectedText.restore(out);
 const result=preserveOuterWhitespace(value,out);
 translationCache.set(cacheKey,result);
 return result;
}

/** Explicit pair API for all new UI text. This is the preferred path going forward. */
export function uiPair(locale:UiLocale,en:string,vi:string){
 return locale==="vi"?vi:en;
}

export function isUiLocale(value:unknown):value is UiLocale{
 return value==="en"||value==="vi";
}

export const UI_CATALOG_PAIRS=exactPairs.concat(phrasePairs);
