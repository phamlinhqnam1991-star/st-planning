import {NextResponse} from "next/server";
import {getConfigHealth} from "@/lib/config/config-health";
import {getDbHostInfo} from "@/lib/db";

export async function GET(req:Request){
  const fresh=new URL(req.url).searchParams.has("fresh");
  const health=await getConfigHealth();
  return NextResponse.json(
    {health,db:getDbHostInfo()},
    {
      headers:{
        "Cache-Control":fresh
          ? "no-store"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
