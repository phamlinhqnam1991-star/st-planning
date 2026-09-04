import {Pool} from "pg";

/*
 * V438 — provider-neutral PostgreSQL runtime.
 *
 * Canonical database connection is DATABASE_URL. The app no longer contains
 * Supabase/Supavisor-specific DNS routing or pooler selection. This keeps the
 * Planning/Batch/Schedule business layer unchanged while allowing Aiven (or
 * another standard PostgreSQL provider) to be the database.
 *
 * Aiven Free has a small server-side connection budget, so the Vercel-local
 * pool defaults to one connection per runtime instance. DB_POOL_MAX can be
 * raised deliberately later after observing real concurrency.
 *
 * DATABASE_URL should include sslmode=require for Aiven.
 */

type GlobalWithStPlanningPool=typeof globalThis&{
  __stPlanningPgPool?:Pool;
  __stPlanningPoolPromise?:Promise<Pool>|null;
  __stPlanningDbInfo?:DbHostInfo;
};

export type DbHostInfo={
  label:string;
  host:string;
  port:string;
  ipOverride:boolean;
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
   const t=setTimeout(()=>reject(new Error(label?`[db] ${label} timeout after ${Math.round(ms/1000)}s`:"database timeout")),ms);
   t.unref?.();
  })
 ]);
}

async function initPool():Promise<Pool>{
 if(globalWithPool.__stPlanningPoolPromise)return globalWithPool.__stPlanningPoolPromise;
 const promise=(async()=>{
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString)throw new Error("Missing DATABASE_URL");

  let url:URL;
  try{url=new URL(connectionString);}catch{throw new Error("DATABASE_URL is not a valid PostgreSQL connection URI");}

  globalWithPool.__stPlanningDbInfo={
   label:"postgres",
   host:url.hostname,
   port:url.port||"5432",
   ipOverride:false
  };

  const max=boundedInt(process.env.DB_POOL_MAX,1,1,5);
  const connectionTimeoutMillis=boundedInt(process.env.DB_CONNECT_TIMEOUT_MS,10000,5000,60000);

  // V439 — Node `pg` currently interprets `sslmode=require` more strictly
  // than libpq and may reject Aiven with SELF_SIGNED_CERT_IN_CHAIN. Keep TLS
  // enabled while matching libpq `require` semantics for the provider URI.
  // Optional DATABASE_CA_CERT can be supplied later for strict CA verification.
  const nodeUrl=new URL(connectionString);
  const sslmode=(nodeUrl.searchParams.get("sslmode")||"").toLowerCase();
  let ssl:undefined|{rejectUnauthorized:boolean;ca?:string};
  if(sslmode==="require"){
   nodeUrl.searchParams.delete("sslmode");
   nodeUrl.searchParams.delete("uselibpqcompat");
   const ca=process.env.DATABASE_CA_CERT?.replace(/\\n/g,"\n").trim();
   ssl=ca?{rejectUnauthorized:true,ca}:{rejectUnauthorized:false};
  }

  const pool=new Pool({
   connectionString:nodeUrl.toString(),
   ...(ssl?{ssl}:{}),
   max,
   connectionTimeoutMillis,
   idleTimeoutMillis:30000,
   allowExitOnIdle:true,
   keepAlive:true,
   keepAliveInitialDelayMillis:10000,
   application_name:"st-planning-vercel"
  });
  pool.on("error",err=>console.error("[postgres-pool] idle client error",err));
  console.log(`[db] connect ${url.hostname}:${url.port||"5432"} poolMax=${max}`);
  return pool;
 })();
 globalWithPool.__stPlanningPoolPromise=promise;
 promise.catch(()=>{globalWithPool.__stPlanningPoolPromise=null;});
 return promise;
}

const CONNECT_TIMEOUT_MS=20_000;

export function getPool(){
 return {
  connect:async()=>{
   const p=await initPool();
   try{return await withTimeout(p.connect(),CONNECT_TIMEOUT_MS,"connect");}
   catch(e){
    console.error("[db] connect timeout — recycling pool",e instanceof Error?e.message:String(e));
    p.end().catch(()=>{});
    globalWithPool.__stPlanningPoolPromise=null;
    throw e;
   }
  },
  query:async(text:string,values?:unknown[])=>{
   const p=await initPool();
   try{return await withTimeout(p.query(text as any,values as any),CONNECT_TIMEOUT_MS,"query");}
   catch(e){
    console.error("[db] query timeout — recycling pool",e instanceof Error?e.message:String(e));
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
