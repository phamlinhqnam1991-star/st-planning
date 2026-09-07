"use client";

import type {ConfigHealth} from "@/lib/config/config-flow";

export const CONFIG_HEALTH_INVALIDATED_EVENT="st-config-health-invalidated";

let cachedHealth:Partial<ConfigHealth>|null=null;
let pendingHealth:Promise<Partial<ConfigHealth>>|null=null;
let healthGeneration=0;
let healthNeedsFresh=false;

/**
 * Shared browser-side health loader. Config sidebar + overview reuse one
 * in-flight request instead of issuing the same expensive health request twice.
 */
export function loadConfigHealth(forceFresh=false):Promise<Partial<ConfigHealth>>{
 if(!forceFresh&&!healthNeedsFresh&&cachedHealth)return Promise.resolve(cachedHealth);
 if(!forceFresh&&pendingHealth)return pendingHealth;

 if(forceFresh){
  healthGeneration+=1;
  cachedHealth=null;
  pendingHealth=null;
  healthNeedsFresh=true;
 }

 const generation=healthGeneration;
 const fresh=healthNeedsFresh;
 // The first consumer after an invalidation owns the fresh request. Other
 // consumers immediately reuse pendingHealth below on their next call.
 healthNeedsFresh=false;
 const suffix=fresh?`?fresh=${Date.now()}`:"";
 const request=fetch(`/api/config/health${suffix}`,fresh?{cache:"no-store"}:undefined)
  .then(async r=>{
   if(!r.ok)throw new Error(`Config health HTTP ${r.status}`);
   const d=await r.json();
   const health=(d&&typeof d==="object"?d.health:null)||{};
   if(generation===healthGeneration)cachedHealth=health;
   return health as Partial<ConfigHealth>;
  })
  .finally(()=>{
   if(pendingHealth===request)pendingHealth=null;
  });

 pendingHealth=request;
 return request;
}

export function primeConfigHealth(health:Partial<ConfigHealth>){
 cachedHealth=health;
 healthNeedsFresh=false;
}

export function notifyConfigHealthChanged(){
 healthGeneration+=1;
 cachedHealth=null;
 pendingHealth=null;
 healthNeedsFresh=true;
 window.dispatchEvent(new Event(CONFIG_HEALTH_INVALIDATED_EVENT));
}

export function refreshConfigPage(router:{refresh:()=>void},delayMs=0){
 notifyConfigHealthChanged();
 if(delayMs>0){
  window.setTimeout(()=>router.refresh(),delayMs);
 }else{
  router.refresh();
 }
}
