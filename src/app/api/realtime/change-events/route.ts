import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {hashSessionToken,readSessionToken} from "@/lib/security/session";
import {isStRealtimeChange,type StRealtimeDomain} from "@/lib/realtime/st-realtime";

export const dynamic="force-dynamic";
export const runtime="nodejs";

const ALLOWED_DOMAINS=new Set<StRealtimeDomain>([
 "PLANNING","SCHEDULE","PRODUCTION","DASHBOARD","AUDIT","MASTER","CONFIG","IMPORT","CHAT","ADMIN","ALL"
]);

function noStoreJson(body:unknown,status=200){
 return NextResponse.json(body,{status,headers:{"cache-control":"no-store, no-cache, must-revalidate, max-age=0"}});
}

function relationMissing(error:unknown){
 const x=error as {code?:string}|null;
 return x?.code==="42P01";
}

function safePositiveInt(value:string|null,fallback=0){
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:fallback;
}

async function sessionHash(){
 const token=await readSessionToken();
 return token?hashSessionToken(token):null;
}

export async function GET(req:Request){
 const tokenHash=await sessionHash();
 if(!tokenHash)return noStoreJson({ok:false,migrationInstalled:true,authorized:false,latestId:0,events:[]},401);
 const url=new URL(req.url);
 const latestOnly=url.searchParams.get("latest")==="1";
 const after=safePositiveInt(url.searchParams.get("after"),0);
 try{
  if(latestOnly){
   const q=await getPool().query(`
    with auth as (
     select 1
     from app_session s
     join app_user_profile p on p.user_id=s.user_id
     where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and p.is_active=true
     limit 1
    )
    select exists(select 1 from auth) authorized,
           case when exists(select 1 from auth)
             then coalesce((select max(id) from system_change_event),0)
             else 0 end latest_id
   `,[tokenHash]);
   const row=q.rows[0]||{};
   if(!row.authorized)return noStoreJson({ok:false,migrationInstalled:true,authorized:false,latestId:0,events:[]},401);
   return noStoreJson({ok:true,migrationInstalled:true,authorized:true,latestId:Number(row.latest_id||0),events:[]});
  }

  const q=await getPool().query(`
   with auth as (
    select 1
    from app_session s
    join app_user_profile p on p.user_id=s.user_id
    where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and p.is_active=true
    limit 1
   ), picked as (
    select id,event_id,at_ms,source_tab_id,method,path,domains
    from system_change_event
    where id>$2 and exists(select 1 from auth)
    order by id asc
    limit 100
   )
   select exists(select 1 from auth) authorized,
          coalesce((select max(id) from picked),$2::bigint) latest_id,
          coalesce((
           select jsonb_agg(jsonb_build_object(
            'id',event_id,
            'at',at_ms,
            'sourceTabId',source_tab_id,
            'method',method,
            'path',path,
            'domains',to_jsonb(domains)
           ) order by id)
           from picked
          ),'[]'::jsonb) events
  `,[tokenHash,after]);
  const row=q.rows[0]||{};
  if(!row.authorized)return noStoreJson({ok:false,migrationInstalled:true,authorized:false,latestId:after,events:[]},401);
  return noStoreJson({ok:true,migrationInstalled:true,authorized:true,latestId:Number(row.latest_id||after),events:Array.isArray(row.events)?row.events:[]});
 }catch(error){
  if(relationMissing(error))return noStoreJson({ok:true,migrationInstalled:false,authorized:true,latestId:0,events:[]});
  return noStoreJson({ok:false,migrationInstalled:true,authorized:true,latestId:after,events:[]},503);
 }
}

export async function POST(req:Request){
 const tokenHash=await sessionHash();
 if(!tokenHash)return noStoreJson({ok:false,error:"UNAUTHORIZED"},401);
 const raw=await req.json().catch(()=>null) as unknown;
 if(!isStRealtimeChange(raw))return noStoreJson({ok:false,error:"INVALID_REALTIME_EVENT"},400);
 const event={
  ...raw,
  method:String(raw.method||"").toUpperCase().slice(0,12),
  path:String(raw.path||"").slice(0,500),
  sourceTabId:String(raw.sourceTabId||"").slice(0,120),
  domains:Array.from(new Set(raw.domains.filter((x):x is StRealtimeDomain=>ALLOWED_DOMAINS.has(x as StRealtimeDomain)))),
 };
 if(!event.domains.length)event.domains=["ALL"];
 try{
  const q=await getPool().query(`
   with auth as (
    select p.user_id::text user_id
    from app_session s
    join app_user_profile p on p.user_id=s.user_id
    where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and p.is_active=true
    limit 1
   ), ins as (
    insert into system_change_event(event_id,at_ms,source_tab_id,method,path,domains,created_by_user_id)
    select $2,$3,$4,$5,$6,$7::text[],auth.user_id
    from auth
    on conflict(event_id) do nothing
    returning id
   )
   select exists(select 1 from auth) authorized,
          coalesce((select id from ins),(select id from system_change_event where event_id=$2 limit 1),0) event_row_id
  `,[tokenHash,event.id,Math.max(0,Math.trunc(event.at)),event.sourceTabId,event.method,event.path,event.domains]);
  const row=q.rows[0]||{};
  if(!row.authorized)return noStoreJson({ok:false,error:"UNAUTHORIZED"},401);
  return noStoreJson({ok:true,eventRowId:Number(row.event_row_id||0)});
 }catch(error){
  if(relationMissing(error))return noStoreJson({ok:false,error:"MIGRATION_086_REQUIRED"},503);
  return noStoreJson({ok:false,error:"REALTIME_EVENT_WRITE_FAILED"},503);
 }
}
