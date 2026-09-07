import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {writeAudit} from "@/lib/security/audit";
import {hashPassword} from "@/lib/security/password";
import {randomUUID} from "node:crypto";

const clean=(v:unknown)=>String(v??"").trim();
const arr=(v:unknown)=>Array.isArray(v)?v.map(clean).filter(Boolean):[];

async function loadSecurityData(c:any){
 const [usersQ,rolesQ,permsQ,scopesQ,mainsQ,scheduleQ,areasQ]=await Promise.all([
  c.query(`select p.user_id,p.email,p.display_name,p.is_active,p.created_at,
    coalesce(array_agg(distinct ur.role_key) filter(where ur.role_key is not null),'{}') roles
    from app_user_profile p left join app_user_role ur on ur.user_id=p.user_id
    group by p.user_id order by lower(p.email)`),
  c.query(`select role_key,role_name,description from app_role order by role_key`),
  c.query(`select permission_key,permission_name,module_key,description from app_permission order by module_key,permission_key`),
  c.query(`select user_id,scope_type,scope_key from app_user_scope order by user_id,scope_type,scope_key`),
  c.query(`select standard_operation from md_operation_master where coalesce(is_active,true)=true order by coalesce(planning_sort_order,999999),standard_operation`),
  c.query(`select schedule_area_code,schedule_area_name from md_schedule_area where is_active=true order by display_order,schedule_area_code`),
  c.query(`select area_code,area_name from md_area where is_active=true order by sort_order,area_name`),
 ]);
 const rolePermQ=await c.query(`select role_key,permission_key from app_role_permission order by role_key,permission_key`);
 const userPermQ=await c.query(`select user_id,permission_key,allowed from app_user_permission order by user_id,permission_key`);
 const roleMap=new Map<string,Set<string>>();for(const r of rolePermQ.rows){if(!roleMap.has(r.role_key))roleMap.set(r.role_key,new Set());roleMap.get(r.role_key)!.add(r.permission_key);}
 const overrideMap=new Map<string,Map<string,boolean>>();for(const r of userPermQ.rows){if(!overrideMap.has(r.user_id))overrideMap.set(r.user_id,new Map());overrideMap.get(r.user_id)!.set(r.permission_key,Boolean(r.allowed));}
 const scopeMap=new Map<string,Record<string,string[]>>();for(const r of scopesQ.rows){if(!scopeMap.has(r.user_id))scopeMap.set(r.user_id,{PLANNING_MAIN:[],SCHEDULE_AREA:[],PRODUCTION_AREA:[]});scopeMap.get(r.user_id)![r.scope_type]?.push(r.scope_key);}
 const users=usersQ.rows.map((u:any)=>{
  const roles=(u.roles||[]) as string[];const effective=new Set<string>();roles.forEach(r=>roleMap.get(r)?.forEach(p=>effective.add(p)));
  overrideMap.get(u.user_id)?.forEach((allowed,p)=>allowed?effective.add(p):effective.delete(p));
  return {...u,roles,permissions:[...effective].sort(),scopes:scopeMap.get(u.user_id)||{PLANNING_MAIN:[],SCHEDULE_AREA:[],PRODUCTION_AREA:[]}};
 });
 return {users,roles:rolesQ.rows,permissions:permsQ.rows,rolePermissions:Object.fromEntries([...roleMap].map(([k,v])=>[k,[...v]])),scopeOptions:{planningMain:mainsQ.rows.map((r:any)=>r.standard_operation),scheduleArea:scheduleQ.rows,productionArea:areasQ.rows}};
}

export async function GET(){
 const {denied}=await requireApiPermission("security.manage");if(denied)return denied;
 const c=await getPool().connect();try{return NextResponse.json({ok:true,...await loadSecurityData(c)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}finally{c.release();}
}

export async function POST(req:Request){
 const {denied,ctx}=await requireApiPermission("security.manage");if(denied||!ctx)return denied!;
 const b=await req.json().catch(()=>({}));const email=clean(b.email).toLowerCase();const password=clean(b.password);const displayName=clean(b.display_name)||email;
 const roles=arr(b.roles);const permissions=arr(b.permissions);const scopes=b.scopes&&typeof b.scopes==="object"?b.scopes:{};
 if(!email||!email.includes("@"))return NextResponse.json({error:"Email không hợp lệ."},{status:400});
 if(password.length<6)return NextResponse.json({error:"Mật khẩu tạm phải có ít nhất 6 ký tự."},{status:400});
 const userId=randomUUID();const passwordHash=await hashPassword(password);const c=await getPool().connect();
 try{
  await c.query("begin");
  await c.query(`insert into app_user_profile(user_id,email,display_name,is_active,password_hash,password_changed_at) values($1,$2,$3,true,$4,now())`,[userId,email,displayName,passwordHash]);
  for(const role of roles)await c.query(`insert into app_user_role(user_id,role_key) select $1,role_key from app_role where role_key=$2 on conflict do nothing`,[userId,role]);
  const roleGranted=await c.query(`select distinct rp.permission_key from app_role_permission rp where rp.role_key=any($1::text[])`,[roles]);
  const granted=new Set(roleGranted.rows.map((r:any)=>r.permission_key));const desired=new Set(permissions);
  const all=await c.query(`select permission_key from app_permission`);
  for(const r of all.rows){const p=r.permission_key;if(desired.has(p)!==granted.has(p))await c.query(`insert into app_user_permission(user_id,permission_key,allowed) values($1,$2,$3) on conflict(user_id,permission_key) do update set allowed=excluded.allowed`,[userId,p,desired.has(p)]);}
  for(const type of ["PLANNING_MAIN","SCHEDULE_AREA","PRODUCTION_AREA"]){for(const key of arr(scopes[type]))await c.query(`insert into app_user_scope(user_id,scope_type,scope_key) values($1,$2,$3) on conflict do nothing`,[userId,type,key.toUpperCase()]);}
  await writeAudit(c,ctx,{action:"SECURITY_USER_CREATE",entityType:"USER",entityId:userId,summary:`Tạo account ${email}`,after:{email,displayName,roles,permissions,scopes}});
  await c.query("commit");return NextResponse.json({ok:true,user_id:userId});
 }catch(e){await c.query("rollback");return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});}finally{c.release();}
}
