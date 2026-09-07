import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {emitInternalChatRealtime} from "@/lib/internal-chat/server";

const clean=(v:unknown)=>String(v??"").trim();
const MAX_MESSAGE_LENGTH=2000;
const MAX_PAGE=200;

function conversationKey(userId:string,peerUserId:string|null){
 if(!peerUserId)return "GROUP";
 const pair=[userId.toLowerCase(),peerUserId.toLowerCase()].sort();
 return `DM:${pair[0]}:${pair[1]}`;
}
function currentUserPayload(ctx:any){
 return {userId:ctx.userId,displayName:ctx.displayName,email:ctx.email,roles:ctx.roles};
}
function schemaError(error:unknown){
 const x=error as {code?:string;message?:string}|null;
 const msg=String(x?.message||error||"");
 if(x?.code==="42P01"||x?.code==="42703"||/app_chat_|recipient_user_id/i.test(msg))
  return "Internal Chat schema is not installed. Run migration 087_internal_chat_direct_realtime.sql on Aiven PostgreSQL.";
 return msg||"Internal Chat database error.";
}
async function validatePeer(c:any,peerUserId:string,currentUserId:string){
 if(!peerUserId)return null;
 if(peerUserId===currentUserId)throw new Error("Cannot open a direct chat with yourself.");
 const q=await c.query(`select user_id,email,display_name from app_user_profile where user_id=$1 and is_active=true limit 1`,[peerUserId]);
 if(!q.rowCount)throw new Error("Selected chat user is not active or does not exist.");
 return q.rows[0];
}
async function unreadTotal(c:any,userId:string){
 const q=await c.query(`
  with visible as (
   select m.id,m.sender_user_id,
          case when m.recipient_user_id is null then 'GROUP'
               else 'DM:'||least(m.sender_user_id::text,m.recipient_user_id::text)||':'||greatest(m.sender_user_id::text,m.recipient_user_id::text) end conversation_key
   from app_chat_message m
   where m.recipient_user_id is null or m.sender_user_id=$1::uuid or m.recipient_user_id=$1::uuid
  )
  select count(*)::int unread
  from visible m
  left join app_chat_read_state s on s.user_id=$1::uuid and s.conversation_key=m.conversation_key
  where m.sender_user_id is distinct from $1::uuid
    and m.id>coalesce(s.last_read_message_id,0)
 `,[userId]);
 return Number(q.rows[0]?.unread||0);
}

export async function GET(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.view");
 if(denied||!ctx)return denied!;
 const mode=clean(req.nextUrl.searchParams.get("mode")).toLowerCase();
 let c:any=null;
 try{
  c=await getPool().connect();
  if(mode==="unread"){
   return NextResponse.json({ok:true,unread:await unreadTotal(c,ctx.userId)},{headers:{"Cache-Control":"no-store"}});
  }
  if(mode==="users"){
   const q=await c.query(`
    select p.user_id::text user_id,p.email,p.display_name,
           coalesce(array_agg(distinct ur.role_key) filter(where ur.role_key is not null),'{}'::text[]) roles,
           coalesce((
            select count(*)::int
            from app_chat_message m
            left join app_chat_read_state s
              on s.user_id=$1::uuid
             and s.conversation_key='DM:'||least($1::text,p.user_id::text)||':'||greatest($1::text,p.user_id::text)
            where m.recipient_user_id is not null
              and ((m.sender_user_id=$1::uuid and m.recipient_user_id=p.user_id)
                or (m.sender_user_id=p.user_id and m.recipient_user_id=$1::uuid))
              and m.sender_user_id is distinct from $1::uuid
              and m.id>coalesce(s.last_read_message_id,0)
           ),0)::int unread
    from app_user_profile p
    left join app_user_role ur on ur.user_id=p.user_id
    where p.is_active=true and p.user_id<>$1::uuid
    group by p.user_id,p.email,p.display_name
    order by lower(coalesce(nullif(trim(p.display_name),''),p.email)),lower(p.email)
   `,[ctx.userId]);
   const groupQ=await c.query(`
    select count(*)::int unread
    from app_chat_message m
    left join app_chat_read_state s on s.user_id=$1::uuid and s.conversation_key='GROUP'
    where m.recipient_user_id is null
      and m.sender_user_id is distinct from $1::uuid
      and m.id>coalesce(s.last_read_message_id,0)
   `,[ctx.userId]);
   return NextResponse.json({
    ok:true,
    users:q.rows.map((r:any)=>({userId:String(r.user_id),displayName:clean(r.display_name)||clean(r.email),email:clean(r.email),roles:Array.isArray(r.roles)?r.roles:[],unread:Number(r.unread||0)})),
    groupUnread:Number(groupQ.rows[0]?.unread||0),
    unread:await unreadTotal(c,ctx.userId),
    canSend:ctx.permissions.has("chat.send"),
    currentUser:currentUserPayload(ctx)
   },{headers:{"Cache-Control":"no-store"}});
  }

  const afterId=Math.max(0,Number(req.nextUrl.searchParams.get("after_id")||0)||0);
  const peerUserId=clean(req.nextUrl.searchParams.get("peer_user_id"))||null;
  if(peerUserId)await validatePeer(c,peerUserId,ctx.userId);
  const params:any[]=[];
  let where="";
  if(peerUserId){
   params.push(ctx.userId,peerUserId);
   where=`m.recipient_user_id is not null and ((m.sender_user_id=$1::uuid and m.recipient_user_id=$2::uuid) or (m.sender_user_id=$2::uuid and m.recipient_user_id=$1::uuid))`;
  }else{
   where="m.recipient_user_id is null";
  }
  if(afterId>0){params.push(afterId);where+=` and m.id>$${params.length}`;}
  params.push(MAX_PAGE);
  const limitParam=params.length;
  const baseColumns=`m.id,m.message_type,m.sender_user_id,m.sender_display_name,m.recipient_user_id,m.body,m.event_key,m.is_cross_planner,m.source_main,m.affected_main,m.source_planner,m.affected_planner,m.entity_type,m.entity_id,m.metadata_json,m.created_at`;
  const q=afterId>0
   ?await c.query(`select ${baseColumns} from app_chat_message m where ${where} order by m.id asc limit $${limitParam}`,params)
   :await c.query(`select * from (select ${baseColumns} from app_chat_message m where ${where} order by m.id desc limit $${limitParam}) x order by x.id asc`,params);
  return NextResponse.json({
   ok:true,messages:q.rows,canSend:ctx.permissions.has("chat.send"),currentUser:currentUserPayload(ctx),conversationKey:conversationKey(ctx.userId,peerUserId)
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:schemaError(error)},{status:500,headers:{"Cache-Control":"no-store"}});
 }finally{try{c?.release();}catch{}}
}

export async function POST(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.send");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const text=clean(body.message);
 const recipientUserId=clean(body.recipientUserId)||null;
 if(!text)return NextResponse.json({error:"Message cannot be empty."},{status:400});
 if(text.length>MAX_MESSAGE_LENGTH)return NextResponse.json({error:`Message is limited to ${MAX_MESSAGE_LENGTH} characters.`},{status:400});
 let c:any=null;
 try{
  c=await getPool().connect();
  if(recipientUserId)await validatePeer(c,recipientUserId,ctx.userId);
  const q=await c.query(`
   insert into app_chat_message(message_type,sender_user_id,sender_display_name,recipient_user_id,body,event_key,metadata_json)
   values('USER',$1,$2,$3,$4,'USER_MESSAGE',$5::jsonb)
   returning id,message_type,sender_user_id,sender_display_name,recipient_user_id,body,event_key,is_cross_planner,
             source_main,affected_main,source_planner,affected_planner,entity_type,entity_id,metadata_json,created_at
  `,[ctx.userId,ctx.displayName||ctx.email,recipientUserId,text,JSON.stringify({senderEmail:ctx.email,senderRoles:ctx.roles,conversation:recipientUserId?"DIRECT":"GROUP"})]);
  await emitInternalChatRealtime(c,ctx.userId,`USER_MESSAGE:${q.rows[0]?.id||""}`);
  return NextResponse.json({ok:true,message:q.rows[0]},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:schemaError(error)},{status:500});
 }finally{try{c?.release();}catch{}}
}

export async function PATCH(req:NextRequest){
 const {denied,ctx}=await requireApiPermission("chat.view");
 if(denied||!ctx)return denied!;
 const body=await req.json().catch(()=>({}));
 const peerUserId=clean(body.peerUserId)||null;
 let lastId=Math.max(0,Number(body.lastMessageId||0)||0);
 let c:any=null;
 try{
  c=await getPool().connect();
  if(peerUserId)await validatePeer(c,peerUserId,ctx.userId);
  const key=conversationKey(ctx.userId,peerUserId);
  if(!lastId){
   const q=peerUserId
    ?await c.query(`select coalesce(max(id),0)::bigint last_id from app_chat_message where recipient_user_id is not null and ((sender_user_id=$1::uuid and recipient_user_id=$2::uuid) or (sender_user_id=$2::uuid and recipient_user_id=$1::uuid))`,[ctx.userId,peerUserId])
    :await c.query(`select coalesce(max(id),0)::bigint last_id from app_chat_message where recipient_user_id is null`);
   lastId=Number(q.rows[0]?.last_id||0);
  }
  await c.query(`
   insert into app_chat_read_state(user_id,conversation_key,last_read_message_id,last_read_at,updated_at)
   values($1,$2,$3,now(),now())
   on conflict(user_id,conversation_key) do update set
    last_read_message_id=greatest(app_chat_read_state.last_read_message_id,excluded.last_read_message_id),
    last_read_at=now(),updated_at=now()
  `,[ctx.userId,key,lastId]);
  return NextResponse.json({ok:true,lastReadMessageId:lastId,conversationKey:key},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:schemaError(error)},{status:500});
 }finally{try{c?.release();}catch{}}
}
