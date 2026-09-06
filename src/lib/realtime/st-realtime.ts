export const ST_REALTIME_WINDOW_EVENT="st-realtime-change";
export const ST_REALTIME_BROWSER_CHANNEL="st-planning-live-v2";
export const ST_REALTIME_API_PATH="/api/realtime/change-events";
export const ST_REALTIME_POLL_MS=1200;

export type StRealtimeDomain=
 |"PLANNING"
 |"SCHEDULE"
 |"PRODUCTION"
 |"DASHBOARD"
 |"AUDIT"
 |"MASTER"
 |"CONFIG"
 |"IMPORT"
 |"CHAT"
 |"ADMIN"
 |"ALL";

export type StRealtimeChange={
 id:string;
 at:number;
 sourceTabId:string;
 method:string;
 path:string;
 domains:StRealtimeDomain[];
};

export type StRealtimeFeedResponse={
 ok:boolean;
 migrationInstalled:boolean;
 authorized?:boolean;
 latestId:number;
 events:StRealtimeChange[];
};

const READ_ONLY_POST_PATHS=[
 "/api/dashboard/ai",
 "/api/schedule/chemical-simulation",
 "/api/schedule/chemical-suggestion",
 "/api/config/st-operation-flow/impact",
 "/api/planning/candidates/delta",
 "/api/planning/candidates/source",
 "/api/planning/route-status",
 "/api/planning/batch-compatibility",
 "/api/planning/job-debug",
 "/api/planning/recipe-diagnosis",
 "/api/import/upload-url",
];

const LOCAL_ONLY_MUTATION_PATHS=[
 "/api/auth/",
 "/api/planning/board-view",
 "/api/realtime/",
];

function normalizedPath(input:RequestInfo|URL){
 try{
  const raw=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
  return new URL(raw,typeof window!=="undefined"?window.location.origin:"http://localhost").pathname;
 }catch{return "";}
}

export function realtimeMutationRequest(input:RequestInfo|URL,init?:RequestInit){
 const method=String(init?.method||(typeof Request!=="undefined"&&input instanceof Request?input.method:"GET")||"GET").toUpperCase();
 if(!["POST","PUT","PATCH","DELETE"].includes(method))return null;
 const path=normalizedPath(input);
 if(!path.startsWith("/api/"))return null;
 if(LOCAL_ONLY_MUTATION_PATHS.some(x=>path===x||path.startsWith(x)))return null;
 if(method==="POST"&&READ_ONLY_POST_PATHS.some(x=>path===x||path.startsWith(`${x}/`)))return null;
 return {method,path,domains:realtimeDomainsForApiPath(path)};
}

export function realtimeDomainsForApiPath(path:string):StRealtimeDomain[]{
 if(path.startsWith("/api/internal-chat"))return ["CHAT"];
 if(path.startsWith("/api/admin"))return ["ADMIN"];
 if(path.startsWith("/api/production-execution")||path.startsWith("/api/daily-production-adjustment"))
  return ["PRODUCTION","SCHEDULE","PLANNING","DASHBOARD","AUDIT"];
 if(path.startsWith("/api/schedule"))
  return ["SCHEDULE","PRODUCTION","PLANNING","DASHBOARD","AUDIT"];
 if(path.startsWith("/api/planning"))
  return ["PLANNING","SCHEDULE","PRODUCTION","DASHBOARD","AUDIT"];
 if(path.startsWith("/api/import"))
  return ["IMPORT","MASTER","CONFIG","PLANNING","SCHEDULE","PRODUCTION","DASHBOARD","AUDIT"];
 if(path.startsWith("/api/master")||path.startsWith("/api/config")||path.startsWith("/api/process-recipe")||path.startsWith("/api/area"))
  return ["MASTER","CONFIG","PLANNING","SCHEDULE","PRODUCTION","DASHBOARD","AUDIT"];
 return ["ALL"];
}

export function makeRealtimeChange(tabId:string,mutation:{method:string;path:string;domains:StRealtimeDomain[]}):StRealtimeChange{
 const uuid=typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
 return {id:uuid,at:Date.now(),sourceTabId:tabId,method:mutation.method,path:mutation.path,domains:mutation.domains};
}

export function isStRealtimeChange(value:unknown):value is StRealtimeChange{
 if(!value||typeof value!=="object")return false;
 const x=value as Partial<StRealtimeChange>;
 return typeof x.id==="string"&&typeof x.at==="number"&&typeof x.sourceTabId==="string"&&typeof x.path==="string"&&Array.isArray(x.domains);
}

export function isStRealtimeFeedResponse(value:unknown):value is StRealtimeFeedResponse{
 if(!value||typeof value!=="object")return false;
 const x=value as Partial<StRealtimeFeedResponse>;
 return typeof x.ok==="boolean"&&typeof x.migrationInstalled==="boolean"&&typeof x.latestId==="number"&&Array.isArray(x.events);
}
