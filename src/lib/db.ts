import {Pool,Client} from "pg";
import dns from "node:dns";
import net from "node:net";

/*
 * v321: DNS-hardened Supabase connection.
 *
 * Symptom: `getaddrinfo ENOTFOUND aws-0-...pooler.supabase.com` on some
 * machines/networks (broken AAAA queries from the OS resolver, transient DNS,
 * ISP DNS issues) even though the host has valid A records. That failure makes
 * every page/API that touches the DB crash.
 *
 * Strategy (transparent, zero behavior change when DNS is healthy):
 *  1. Try the CONFIGURED URL as-is (pooler, port 6543). Probe uses the same
 *     OS resolver as net.connect (dns.lookup = getaddrinfo), with one retry.
 *  2. If the OS resolver fails, resolve A records via dns.resolve4 (query-only,
 *     skips broken AAAA lookups) and CONNECT BY IPv4 LITERAL + TLS SNI
 *     (ssl.servername = real hostname). Verified working against Supabase.
 *  3. If the URL is a Supabase pooler, also try the DIRECT host
 *     db.<project-ref>.supabase.co:5432 (IPv6-first) with the same two probes.
 *  4. If every probe fails, keep the configured URL so the REAL connect error
 *     still surfaces (with the v321 diagnostics) instead of being swallowed.
 *
 * Manual overrides:
 *  - DB_CONNECTION_STRING=postgres://...  use exactly this URL, skip probing.
 *  - DB_POOL_MAX / DB_CONNECT_TIMEOUT_MS unchanged.
 */

type DbCandidate={
  label:string;
  url:string;
  /** set when the connection must go through an IPv4 literal (bypass OS DNS) */
  ipv4:boolean;
  ssl?:Record<string,unknown>;
};

export type DbHostInfo={
  label:string;
  host:string;
  port:string;
  ipOverride:boolean;
};

type GlobalWithStPlanningPool=typeof globalThis&{
  __stPlanningPgPool?:Pool;
  __stPlanningPoolPromise?:Promise<Pool>|null;
  __stPlanningDbInfo?:DbHostInfo;
};

const globalWithPool=globalThis as GlobalWithStPlanningPool;

function boundedInt(value:string|undefined,fallback:number,min:number,max:number){
 const parsed=Number(value);
 return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

function withTimeout<T>(p:Promise<T>,ms:number,label?:string):Promise<T>{
 return Promise.race([
  p,
  new Promise<never>((_,reject)=>{
   const t=setTimeout(()=>reject(new Error(label?`[db] ${label} timeout after ${Math.round(ms/1000)}s`:"dns lookup timeout")),ms);
   t.unref?.();
  })
 ]);
}

function buildCandidates(connectionString:string):DbCandidate[]{
 const out:DbCandidate[]=[{label:"configured",url:connectionString,ipv4:false}];
 let u:URL;
 try{u=new URL(connectionString);}catch{return out;}
 const hostname=u.hostname;
 const isIp=net.isIP(hostname)!==0;
 if(!isIp){
  // resolve4-only path: works when the OS resolver breaks on AAAA queries.
  out.push({label:"configured-ipv4",url:connectionString,ipv4:true,ssl:{servername:hostname}});
 }
 const isPooler=hostname.endsWith(".pooler.supabase.com");
 const user=decodeURIComponent(u.username);
 const ref=user.includes(".")?user.split(".").pop():"";
 if(isPooler&&ref){
  const direct=new URL(connectionString);
  direct.hostname=`db.${ref}.supabase.co`;
  direct.port="5432";
  direct.username=user.split(".")[0];
  out.push({label:"supabase-direct",url:direct.toString(),ipv4:false});
  out.push({label:"supabase-direct-ipv4",url:direct.toString(),ipv4:true,ssl:{servername:direct.hostname}});
 }
 return out;
}

/** Returns the host to use for `host` in the pool config, or null when the
 *  candidate must be skipped. `ipv4` candidates resolve A records via DNS
 *  query (c-ares) and return the literal IP; normal candidates only verify the
 *  hostname resolves through the OS resolver (same path net.connect uses). */
async function probeCandidate(cand:DbCandidate):Promise<string|null>{
 let hostname="";
 try{hostname=new URL(cand.url).hostname;}catch{return null;}
 if(net.isIP(hostname)!==0)return hostname;
 try{
  if(cand.ipv4){
   const addrs=await withTimeout(dns.promises.resolve4(hostname),5000);
   return addrs.length?addrs[0]:null;
  }
  const res=await withTimeout(dns.promises.lookup(hostname,{all:true}),5000);
  return Array.isArray(res)&&res.length>0?hostname:null;
 }catch{return null;}
}

async function pickCandidate(candidates:DbCandidate[]):Promise<{cand:DbCandidate;host:string|null;index:number}>{
 for(let i=0;i<candidates.length;i++){
  const cand=candidates[i];
  // one retry for the PRIMARY configured candidate (transient DNS is common)
  const attempts=i===0?2:1;
  for(let a=0;a<attempts;a++){
   const host=await probeCandidate(cand);
   if(host)return {cand,host,index:i};
   if(a<attempts-1)await new Promise(r=>setTimeout(r,250));
  }
 }
 // DNS broken for every candidate — keep the configured URL so the real
 // connect error (not a swallowed probe) reaches the v321 diagnostics.
 return {cand:candidates[0],host:null,index:0};
}

type LatencyPick={
 cand:DbCandidate;
 host:string|null;
 ms:number|null;
 probeMs:{label:string;ms:number|null}[];
};

// v325: when DNS is healthy, CONNECT to both the configured host and the
// Supabase direct host, then keep whichever connects faster. Some networks
// (e.g. IPv6-enabled ISPs) reach db.<ref>.supabase.co much better than the
// IPv4 pooler; this makes the app self-select the fast path once per process
// instead of always assuming the pooler is best.
async function latencyPick(candidates:DbCandidate[],chosen:DbCandidate,chosenHost:string|null):Promise<LatencyPick>{
 const probeTargets=candidates.filter(c=>c.label==="configured"||c.label==="supabase-direct");
 if(chosen.label!=="configured"||probeTargets.length<2){
  return {cand:chosen,host:chosenHost,ms:null,probeMs:[]};
 }
 const probeMs:{label:string;ms:number|null}[]=[];
 for(const cand of probeTargets){
  let u:URL;
  try{u=new URL(cand.url);}catch{probeMs.push({label:cand.label,ms:null});continue;}
  if(net.isIP(u.hostname)!==0){probeMs.push({label:cand.label,ms:null});continue;}
  const started=Date.now();
  const probe=new Client({connectionString:cand.url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:4000});
  try{
   await probe.connect();
   probeMs.push({label:cand.label,ms:Date.now()-started});
  }catch{
   probeMs.push({label:cand.label,ms:null});
  }finally{
   probe.end().catch(()=>{});
  }
 }
 const ok=probeMs.filter(r=>r.ms!==null) as {label:string;ms:number}[];
 if(!ok.length)return {cand:chosen,host:chosenHost,ms:null,probeMs};
 const fastest=ok.reduce((a,b)=>(b.ms<a.ms?b:a));
 const cand=candidates.find(c=>c.label===fastest.label)??chosen;
 return {cand,host:null,ms:fastest.ms,probeMs};
}

async function initPool():Promise<Pool>{
 if(globalWithPool.__stPlanningPoolPromise)return globalWithPool.__stPlanningPoolPromise;
 const promise=(async()=>{
  const connectionString=process.env.SUPABASE_DB_URL;
  if(!connectionString)throw new Error("Missing SUPABASE_DB_URL");
  const override=process.env.DB_CONNECTION_STRING;
  const candidates=override
   ?[{label:"override",url:override,ipv4:false}]
   :buildCandidates(connectionString);
  const picked=await pickCandidate(candidates);
  const latency=await latencyPick(candidates,picked.cand,picked.host);
  const cand=latency.cand;
  const host=latency.host;
  let u:URL;
  try{u=new URL(cand.url);}catch{u=new URL(connectionString);}
  const info:DbHostInfo={
   label:cand.label,
   host:cand.ipv4&&host?host:u.hostname,
   port:u.port||(u.protocol==="postgresql:"?"5432":"5432"),
   ipOverride:Boolean(cand.ipv4&&host)
  };
  globalWithPool.__stPlanningDbInfo=info;
  if(latency.ms!==null){
   console.warn(`[db] latency probe: ${latency.probeMs.map(p=>`${p.label}=${p.ms==null?"FAIL":p.ms+"ms"}`).join(" ")} -> using ${cand.label}`);
  }else if(picked.index>0||info.ipOverride){
   console.warn(`[db] Supabase host fallback -> ${cand.label} ${info.host}:${info.port}${info.ipOverride?` (IPv4 ${host})`:""}`);
  }else{
   console.log(`[db] connect ${info.host}:${info.port} (${cand.label})`);
  }
  const supabase=u.hostname.endsWith(".supabase.co")||u.hostname.endsWith(".pooler.supabase.com");
  if(supabase&&u.port!=="6543")console.warn(`[db] Runtime should use Supabase Transaction Pooler :6543, current port=${u.port||"default"}`);
  const localPoolMax=boundedInt(process.env.DB_POOL_MAX,5,1,10);
  const connectionTimeoutMillis=boundedInt(process.env.DB_CONNECT_TIMEOUT_MS,10000,5000,60000);
  const config:Record<string,unknown>={
   connectionString:cand.url,
   ssl:{rejectUnauthorized:false,...(cand.ssl??{})},
   // Supavisor owns the database-side pool. A few local slots prevent a slow
   // Planning request from blocking every concurrent Server Component request.
   max:localPoolMax,
   connectionTimeoutMillis,
   idleTimeoutMillis:30000,
   allowExitOnIdle:true,
   keepAlive:true,
   keepAliveInitialDelayMillis:10000,
   application_name:"st-planning-vercel"
  };
  if(host&&cand.ipv4)config.host=host; // connect by IPv4 literal, SNI via ssl.servername
  const pool=new Pool(config as any);
  pool.on("error",err=>console.error("[postgres-pool] idle client error",err));
  return pool;
 })();
 globalWithPool.__stPlanningPoolPromise=promise;
 promise.catch(()=>{globalWithPool.__stPlanningPoolPromise=null;});
 return promise;
}

/** v323: hard timeout (20s) around pool.connect()/query() — a wedged Supavisor
 *  connection or exhausted pool must reject with a readable error instead of
 *  queuing forever (this is what made the board spin past 60s). On timeout the
 *  pool is recycled so the next request builds a fresh one (self-heal). */
const CONNECT_TIMEOUT_MS=20_000;

export function getPool(){
 return {
  connect:async()=>{
   const p=await initPool();
   try{return await withTimeout(p.connect(),CONNECT_TIMEOUT_MS,"connect");}
   catch(e){
    console.error(`[db] connect timeout — recycling pool`,e instanceof Error?e.message:String(e));
    p.end().catch(()=>{});
    globalWithPool.__stPlanningPoolPromise=null;
    throw e;
   }
  },
  query:async(text:string,values?:unknown[])=>{
   const p=await initPool();
   try{return await withTimeout(p.query(text as any,values as any),CONNECT_TIMEOUT_MS,"query");}
   catch(e){
    console.error(`[db] query timeout — recycling pool`,e instanceof Error?e.message:String(e));
    p.end().catch(()=>{});
    globalWithPool.__stPlanningPoolPromise=null;
    throw e;
   }
  },
  end:async()=>{try{const p=await globalWithPool.__stPlanningPoolPromise;if(p)await p.end();}catch{}}
 };
}

export function getDbHostInfo():DbHostInfo{
 return globalWithPool.__stPlanningDbInfo??{label:"not-initialized",host:"",port:"",ipOverride:false};
}
