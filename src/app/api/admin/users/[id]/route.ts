import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {writeAudit} from "@/lib/security/audit";
import {hashPassword} from "@/lib/security/password";
const clean=(v:unknown)=>String(v??"").trim();const arr=(v:unknown)=>Array.isArray(v)?v.map(clean).filter(Boolean):[];

export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 const {denied,ctx}=await requireApiPermission("security.manage");if(denied||!ctx)return denied!;const {id}=await params;const b=await req.json().catch(()=>({}));
 const displayName=clean(b.display_name);const active=Boolean(b.is_active);const roles=arr(b.roles);const permissions=arr(b.permissions);const scopes=b.scopes&&typeof b.scopes==="object"?b.scopes:{};const password=clean(b.password);
 if(id===ctx.userId&&!active)return NextResponse.json({error:"Không thể tự khóa tài khoản đang đăng nhập."},{status:400});
 if(id===ctx.userId&&!permissions.includes("security.manage"))return NextResponse.json({error:"Không thể tự gỡ quyền quản lý Users & Permissions của chính tài khoản đang đăng nhập."},{status:400});
 const c=await getPool().connect();try{
  await c.query("begin");const beforeQ=await c.query(`select * from app_user_profile where user_id=$1 for update`,[id]);if(!beforeQ.rowCount)throw new Error("Không tìm thấy user.");
  await c.query(`update app_user_profile set display_name=$2,is_active=$3,updated_at=now() where user_id=$1`,[id,displayName||beforeQ.rows[0].display_name,active]);
  await c.query(`delete from app_user_role where user_id=$1`,[id]);for(const role of roles)await c.query(`insert into app_user_role(user_id,role_key) select $1,role_key from app_role where role_key=$2 on conflict do nothing`,[id,role]);
  await c.query(`delete from app_user_permission where user_id=$1`,[id]);const roleGranted=await c.query(`select distinct rp.permission_key from app_role_permission rp where rp.role_key=any($1::text[])`,[roles]);const granted=new Set(roleGranted.rows.map((r:any)=>r.permission_key));const desired=new Set(permissions);const all=await c.query(`select permission_key from app_permission`);for(const r of all.rows){const p=r.permission_key;if(desired.has(p)!==granted.has(p))await c.query(`insert into app_user_permission(user_id,permission_key,allowed) values($1,$2,$3)`,[id,p,desired.has(p)]);}
  await c.query(`delete from app_user_scope where user_id=$1`,[id]);for(const type of ["PLANNING_MAIN","SCHEDULE_AREA","PRODUCTION_AREA"]){for(const key of arr(scopes[type]))await c.query(`insert into app_user_scope(user_id,scope_type,scope_key) values($1,$2,$3) on conflict do nothing`,[id,type,key.toUpperCase()]);}
  if(password){if(password.length<6)throw new Error("Mật khẩu mới phải có ít nhất 6 ký tự.");const passwordHash=await hashPassword(password);await c.query(`update app_user_profile set password_hash=$2,password_changed_at=now(),updated_at=now() where user_id=$1`,[id,passwordHash]);}
  const {password_hash:_passwordHash,...beforeSafe}=beforeQ.rows[0];await writeAudit(c,ctx,{action:"SECURITY_USER_UPDATE",entityType:"USER",entityId:id,summary:`Cập nhật quyền ${beforeQ.rows[0].email}`,before:beforeSafe,after:{displayName,active,roles,permissions,scopes}});await c.query("commit");return NextResponse.json({ok:true});
 }catch(e){await c.query("rollback");return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}finally{c.release();}
}

export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
 const {denied,ctx}=await requireApiPermission("security.manage");if(denied||!ctx)return denied!;const {id}=await params;if(id===ctx.userId)return NextResponse.json({error:"Không thể xóa tài khoản đang đăng nhập."},{status:400});
 const c=await getPool().connect();try{await c.query("begin");const q=await c.query(`select email from app_user_profile where user_id=$1 for update`,[id]);if(!q.rowCount)throw new Error("Không tìm thấy user.");await c.query(`delete from app_user_profile where user_id=$1`,[id]);await writeAudit(c,ctx,{action:"SECURITY_USER_DELETE",entityType:"USER",entityId:id,summary:`Xóa account ${q.rows[0].email}`});await c.query("commit");return NextResponse.json({ok:true});}catch(e){await c.query("rollback");return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}finally{c.release();}
}
