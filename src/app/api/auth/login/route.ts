import {NextResponse} from "next/server";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {getPool} from "@/lib/db";
import {createSession,SESSION_COOKIE} from "@/lib/security/session";
import {hashPassword,verifyPassword} from "@/lib/security/password";
const clean=(v:unknown)=>String(v??"").trim();
function adminEmails(){return new Set((process.env.ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));}
function safeEqualText(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({}));const email=clean(b.email).toLowerCase();const password=clean(b.password);
 if(!email||!password)return NextResponse.json({error:"Vui lòng nhập email và mật khẩu."},{status:400});
 const c=await getPool().connect();let user:any=null;
 try{
  await c.query("begin");const q=await c.query(`select user_id,email,display_name,is_active,password_hash from app_user_profile where lower(email)=lower($1) for update`,[email]);
  if(q.rowCount){user=q.rows[0];if(!user.is_active){await c.query("rollback");return NextResponse.json({error:"Tài khoản đang bị khóa."},{status:403});}
   let ok=await verifyPassword(password,user.password_hash);
   if(!ok&&!user.password_hash&&adminEmails().has(email)){const bootstrap=process.env.BOOTSTRAP_ADMIN_PASSWORD||"";if(bootstrap&&safeEqualText(password,bootstrap)){const h=await hashPassword(password);await c.query(`update app_user_profile set password_hash=$2,password_changed_at=now(),updated_at=now() where user_id=$1`,[user.user_id,h]);await c.query(`insert into app_user_role(user_id,role_key) values($1,'ADMIN') on conflict do nothing`,[user.user_id]);ok=true;}}
   if(!ok){await c.query("rollback");return NextResponse.json({error:"Email hoặc mật khẩu không đúng."},{status:401});}
  }else{
   if(!adminEmails().has(email)){await c.query("rollback");return NextResponse.json({error:"Email hoặc mật khẩu không đúng."},{status:401});}
   const bootstrap=process.env.BOOTSTRAP_ADMIN_PASSWORD||"";if(!bootstrap){await c.query("rollback");return NextResponse.json({error:"Chưa cấu hình BOOTSTRAP_ADMIN_PASSWORD cho Admin đầu tiên."},{status:500});}
   if(!safeEqualText(password,bootstrap)){await c.query("rollback");return NextResponse.json({error:"Email hoặc mật khẩu không đúng."},{status:401});}
   const id=randomUUID(),h=await hashPassword(password);await c.query(`insert into app_user_profile(user_id,email,display_name,is_active,password_hash,password_changed_at) values($1,$2,$3,true,$4,now())`,[id,email,email,h]);await c.query(`insert into app_user_role(user_id,role_key) values($1,'ADMIN') on conflict do nothing`,[id]);user={user_id:id,email,display_name:email,is_active:true};
  }
  await c.query(`update app_user_profile set last_login_at=now(),updated_at=now() where user_id=$1`,[user.user_id]);await c.query(`delete from app_session where expires_at<=now() or revoked_at is not null`);await c.query("commit");
 }catch(e){await c.query("rollback").catch(()=>{});return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}finally{c.release();}
 const meta={userAgent:req.headers.get("user-agent")||undefined,ipAddress:req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()};const session=await createSession(String(user.user_id),meta);
 const res=NextResponse.json({ok:true});res.cookies.set(SESSION_COOKIE,session.token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:session.hours*3600});return res;
}
