import {Pool} from "pg";

type GlobalWithStPlanningPool=typeof globalThis&{
 __stPlanningPgPool?:Pool;
};

const globalWithPool=globalThis as GlobalWithStPlanningPool;

function boundedInt(value:string|undefined,fallback:number,min:number,max:number){
 const parsed=Number(value);
 return Number.isInteger(parsed)?Math.min(max,Math.max(min,parsed)):fallback;
}

export function getPool(){
 if(!globalWithPool.__stPlanningPgPool){
  const connectionString=process.env.SUPABASE_DB_URL;
  if(!connectionString)throw new Error("Missing SUPABASE_DB_URL");
  try{
   const u=new URL(connectionString);
   const supabase=u.hostname.endsWith(".supabase.co")||u.hostname.endsWith(".pooler.supabase.com");
   if(supabase&&u.port!=="6543")console.warn(`[db] Runtime should use Supabase Transaction Pooler :6543, current port=${u.port||"default"}`);
  }catch{}
  // Reuse one local pool across Next.js/Turbopack module reloads. Without the
  // global singleton, stale modules can retain old pools and exhaust Supavisor.
  const localPoolMax=boundedInt(process.env.DB_POOL_MAX,5,1,10);
  const connectionTimeoutMillis=boundedInt(process.env.DB_CONNECT_TIMEOUT_MS,20000,5000,60000);
  const pool=new Pool({
   connectionString,
   // Supavisor owns the database-side pool. A few local slots prevent a slow
   // Planning request from blocking every concurrent Server Component request.
   max:localPoolMax,
   connectionTimeoutMillis,
   idleTimeoutMillis:30000,
   allowExitOnIdle:true,
   keepAlive:true,
   keepAliveInitialDelayMillis:10000,
   application_name:"st-planning-vercel",
   ssl:{rejectUnauthorized:false}
  });
  pool.on("error",err=>console.error("[postgres-pool] idle client error",err));
  globalWithPool.__stPlanningPgPool=pool;
 }
 return globalWithPool.__stPlanningPgPool;
}
