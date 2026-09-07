import {Pool,type QueryResult} from "pg";

/*
 * V438 — provider-neutral PostgreSQL runtime.
 *
 * Canonical database connection is DATABASE_URL. The app no longer contains
 * Supabase/Supavisor-specific DNS routing or pooler selection. This keeps the
 * Planning/Batch/Schedule business layer unchanged while allowing Aiven (or
 * another standard PostgreSQL provider) to be the database.
 *
 * Aiven Free has a small server-side connection budget, so the Vercel-local
 * pool defaults to one connection per runtime instance. V517 also releases
 * idle runtime connections sooner and never tears down a shared pool merely
 * because one request is slow. DB_POOL_MAX can be raised deliberately later.
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
  const connectionTimeoutMillis=boundedInt(process.env.DB_CONNECT_TIMEOUT_MS,8000,3000,60000);
  const queryTimeoutMillis=boundedInt(process.env.DB_QUERY_TIMEOUT_MS,15000,5000,120000);
  const idleTimeoutMillis=boundedInt(process.env.DB_IDLE_TIMEOUT_MS,5000,1000,30000);

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
   query_timeout:queryTimeoutMillis,
   statement_timeout:queryTimeoutMillis,
   idleTimeoutMillis,
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

export function getPool(){
 return {
  connect:async()=>{
   const p=await initPool();
   // V517: do not wrap pool.connect() in Promise.race. If the artificial
   // timeout wins, the original pg checkout remains queued and can later
   // resolve to a client that nobody releases. Also never p.end() a shared
   // pool because one request is slow while other tabs may still be using it.
   // pg's connectionTimeoutMillis is the canonical checkout/connect guard.
   try{return await p.connect();}
   catch(e){
    console.error("[db] connect failed",e instanceof Error?e.message:String(e));
    throw e;
   }
  },
  query:async(text:string,values?:unknown[]):Promise<QueryResult<any>>=>{
   const p=await initPool();
   // query_timeout / statement_timeout on the pg client bound query lifetime
   // without killing the shared pool or interrupting unrelated requests.
   try{return await p.query<any>(text,values as any);}
   catch(e){
    console.error("[db] query failed",e instanceof Error?e.message:String(e));
    throw e;
   }
  },
  end:async()=>{try{const p=await globalWithPool.__stPlanningPoolPromise;if(p)await p.end();}catch{}}
 };
}

export function getDbHostInfo():DbHostInfo{
 return globalWithPool.__stPlanningDbInfo??{label:"not-initialized",host:"",port:"",ipOverride:false};
}
