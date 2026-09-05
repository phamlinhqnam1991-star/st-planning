import {NextResponse} from "next/server";
import {getConfigHealth} from "@/lib/config/config-health";
import {getPool,getDbHostInfo} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

export async function GET(req:Request){
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
  const fresh=new URL(req.url).searchParams.has("fresh");
  // v325: _timingMs must be a REAL DB round-trip (select 1), not the unstable_cache
  // read time — and this forces pool init so db.* reflects the actual host.
  const started=Date.now();
  const probeClient=await getPool().connect();
  try{
    await probeClient.query("select 1");
  }finally{
    probeClient.release();
  }
  const health=await getConfigHealth();
  return NextResponse.json(
    {health,db:getDbHostInfo(),_timingMs:Date.now()-started},
    {
      headers:{
        "Cache-Control":fresh
          ? "no-store"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
