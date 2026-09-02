import fs from "node:fs";

const path="src/lib/i18n/ui-catalog.json";
const catalog=JSON.parse(fs.readFileSync(path,"utf8"));
const errors=[];
if(catalog.defaultLocale!=="en")errors.push("defaultLocale must remain EN.");
if(JSON.stringify(catalog.locales)!==JSON.stringify(["en","vi"]))errors.push("Supported UI locales must remain [en, vi].");
if(!Array.isArray(catalog.pairs)||!catalog.pairs.length)errors.push("Translation catalog is empty.");

const exactEn=new Map();
const exactVi=new Map();
for(const [index,pair] of (catalog.pairs||[]).entries()){
 if(!String(pair.en||"").trim()||!String(pair.vi||"").trim())errors.push(`Pair #${index+1} is missing EN or VI.`);
 if(pair.mode==="exact"){
  const en=String(pair.en).replace(/\s+/g," ").trim().toLowerCase();
  const vi=String(pair.vi).replace(/\s+/g," ").trim().toLowerCase();
  if(exactEn.has(en)&&exactEn.get(en)!==pair.vi)errors.push(`Conflicting exact EN translation: ${pair.en}`);
  if(exactVi.has(vi)&&exactVi.get(vi)!==pair.en)errors.push(`Conflicting exact VI translation: ${pair.vi}`);
  exactEn.set(en,pair.vi);exactVi.set(vi,pair.en);
 }
}

const required=["Operations","Tracking","Administration","Configuration","Scheduling Board","Search","Save","Cancel","Actions","Status","Priority"];
for(const key of required){if(!exactEn.has(key.toLowerCase()))errors.push(`Missing required exact UI pair: ${key}`)}

if(errors.length){
 console.error("UI i18n check FAILED");
 for(const e of errors)console.error(`- ${e}`);
 process.exit(1);
}
console.log(`UI i18n check OK · ${catalog.pairs.length} EN/VI pairs · default EN · UI-only translation architecture.`);
