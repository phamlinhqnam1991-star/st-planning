import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

const clean=(v:unknown)=>String(v??"").trim();
const MAX_MESSAGE_LENGTH=2000;
const MAX_PAGE=200;

async function unreadCount(c:any,userId:string){
 const q=await c.query(`
  select count(*)::int unread
  from app_chat_message m
  left join app_chat_user_state s on s.user_id=$1
  where m.id>coalesce(s.last_read_message_id,0)
    and m.sender_user_id is distinct from $1::uuid
 `,[userId]);
 return Number(q.rows[0]?.unread||0);
}

export async function GET(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.view");
 if(denied||!ctx)return denied!;
 const mode=clean(req.nextUrl.searchParams.get("mode")).toLowerCase();
 const afterId=Math.max(0,Number(req.nextUrl.searchParams.get("after_id")||0)||0);
 const c=await getPool().connect();
 try{
  if(mode==="unread"){
   return NextResponse.json({ok:true,unread:await unreadCount(c,ctx.userId)},{headers:{"Cache-Control":"no-store"}});
  }
  const q=afterId>0
   ?await c.query(`
     select m.id,m.message_type,m.sender_user_id,m.sender_display_name,m.body,m.event_key,m.is_cross_planner,
            m.source_main,m.affected_main,m.source_planner,m.affected_planner,m.entity_type,m.entity_id,m.metadata_json,m.created_at
     from app_chat_message m
     where m.id>$1
     order by m.id asc
     limit $2
    `,[afterId,MAX_PAGE])
   :await c.query(`
     select * from (
      select m.id,m.message_type,m.sender_user_id,m.sender_display_name,m.body,m.event_key,m.is_cross_planner,
             m.source_main,m.affected_main,m.source_planner,m.affected_planner,m.entity_type,m.entity_id,m.metadata_json,m.created_at
      from app_chat_message m
      order by m.id desc
      limit $1
     ) x
     order by x.id asc
    `,[MAX_PAGE]);
  return NextResponse.json({
   ok:true,
   messages:q.rows,
   unread:await unreadCount(c,ctx.userId),
   currentUser:{userId:ctx.userId,displayName:ctx.displayName,email:ctx.email,roles:ctx.roles}
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  const missing=/app_chat_(message|user_state)/i.test(message)?"Internal Chat is not installed. Run V495_APPLY_AIVEN.sql on Aiven PostgreSQL.":message;
  return NextResponse.json({error:missing},{status:500,headers:{"Cache-Control":"no-store"}});
 }finally{c.release();}
}

export async function POST(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.send");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const text=clean(body.message);
 if(!text)return NextResponse.json({error:"Message cannot be empty."},{status:400});
 if(text.length>MAX_MESSAGE_LENGTH)return NextResponse.json({error:`Message is limited to ${MAX_MESSAGE_LENGTH} characters.`},{status:400});
 const c=await getPool().connect();
 try{
  const q=await c.query(`
   insert into app_chat_message(message_type,sender_user_id,sender_display_name,body,event_key,metadata_json)
   values('USER',$1,$2,$3,'USER_MESSAGE',$4::jsonb)
   returning id,message_type,sender_user_id,sender_display_name,body,event_key,is_cross_planner,
             source_main,affected_main,source_planner,affected_planner,entity_type,entity_id,metadata_json,created_at
  `,[ctx.userId,ctx.displayName||ctx.email,text,JSON.stringify({senderEmail:ctx.email,senderRoles:ctx.roles})]);
  return NextResponse.json({ok:true,message:q.rows[0]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});
 }finally{c.release();}
}

export async function PATCH(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.view");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 let lastId=Math.max(0,Number(body.lastMessageId||0)||0);
 const c=await getPool().connect();
 try{
  if(!lastId){
   const q=await c.query(`select coalesce(max(id),0)::bigint last_id from app_chat_message`);
   lastId=Number(q.rows[0]?.last_id||0);
  }
  await c.query(`
   insert into app_chat_user_state(user_id,last_read_message_id,last_read_at,updated_at)
   values($1,$2,now(),now())
   on conflict(user_id) do update set
    last_read_message_id=greatest(app_chat_user_state.last_read_message_id,excluded.last_read_message_id),
    last_read_at=now(),updated_at=now()
  `,[ctx.userId,lastId]);
  return NextResponse.json({ok:true,lastReadMessageId:lastId},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});
 }finally{c.release();}
}
