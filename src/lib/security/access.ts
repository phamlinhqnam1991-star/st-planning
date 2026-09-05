import {redirect} from "next/navigation";
import {getPool} from "@/lib/db";
import {ALL_PERMISSION_SET,PAGE_PERMISSION,type PermissionKey,type ScopeType} from "@/lib/security/permissions";
import {hashSessionToken,readSessionToken} from "@/lib/security/session";

export type AccessContext={userId:string;email:string;displayName:string;active:boolean;bootstrapAdmin:boolean;roles:string[];permissions:Set<string>;scopes:Record<ScopeType,Set<string>>;};
const EMPTY_SCOPES=()=>({PLANNING_MAIN:new Set<string>(),SCHEDULE_AREA:new Set<string>(),PRODUCTION_AREA:new Set<string>()});
function bootstrapAdmins(){return new Set((process.env.ADMIN_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));}
export async function getAccessContext():Promise<AccessContext|null>{
 const token=await readSessionToken();if(!token)return null;const c=await getPool().connect();
 try{
  const sessionQ=await c.query(`select s.user_id,p.email,p.display_name,p.is_active from app_session s join app_user_profile p on p.user_id=s.user_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() limit 1`,[hashSessionToken(token)]);
  if(!sessionQ.rowCount)return null;const p=sessionQ.rows[0];const email=String(p.email||"").trim().toLowerCase();const bootstrapAdmin=bootstrapAdmins().has(email);
  if(!p.is_active)return {userId:String(p.user_id),email,displayName:p.display_name||email,active:false,bootstrapAdmin,roles:[],permissions:new Set(),scopes:EMPTY_SCOPES()};
  if(bootstrapAdmin)return {userId:String(p.user_id),email,displayName:p.display_name||email,active:true,bootstrapAdmin:true,roles:["ADMIN"],permissions:new Set(ALL_PERMISSION_SET),scopes:EMPTY_SCOPES()};
  const [rolesQ,permsQ,scopesQ]=await Promise.all([
   c.query(`select role_key from app_user_role where user_id=$1 order by role_key`,[p.user_id]),
   c.query(`select distinct rp.permission_key from app_user_role ur join app_role_permission rp on rp.role_key=ur.role_key where ur.user_id=$1 union select permission_key from app_user_permission where user_id=$1 and allowed=true except select permission_key from app_user_permission where user_id=$1 and allowed=false`,[p.user_id]),
   c.query(`select scope_type,scope_key from app_user_scope where user_id=$1 order by scope_type,scope_key`,[p.user_id]),
  ]);
  const scopes=EMPTY_SCOPES();for(const row of scopesQ.rows){const t=String(row.scope_type||"") as ScopeType;if(scopes[t])scopes[t].add(String(row.scope_key||"").trim().toUpperCase());}
  return {userId:String(p.user_id),email,displayName:p.display_name||email,active:true,bootstrapAdmin:false,roles:rolesQ.rows.map(r=>String(r.role_key)),permissions:new Set(permsQ.rows.map(r=>String(r.permission_key))),scopes};
 }finally{c.release();}
}
export function hasPermission(ctx:AccessContext|null,permission:string){return Boolean(ctx?.active&&ctx.permissions.has(permission));}
export function scopeAllows(ctx:AccessContext|null,type:ScopeType,key:string|null|undefined){if(!ctx?.active)return false;if(ctx.bootstrapAdmin||ctx.roles.includes("ADMIN"))return true;const set=ctx.scopes[type];if(!set||set.size===0)return true;return Boolean(key&&set.has(String(key).trim().toUpperCase()));}
export async function requireAccess(permission:PermissionKey){const ctx=await getAccessContext();if(!ctx)redirect("/login");if(!ctx.active)redirect("/access-denied?reason=inactive");if(!ctx.permissions.has(permission))redirect("/access-denied");return ctx;}
export async function requireLeafAccess(leaf:keyof typeof PAGE_PERMISSION){return requireAccess(PAGE_PERMISSION[leaf]);}
export function firstAllowedPath(ctx:AccessContext){const order:Array<[PermissionKey,string]>=[["dashboard.view","/dashboard"],["jobs.view","/all-open-jobs"],["planning.view","/planning"],["schedule.view","/schedule"],["production.view","/production-execution"],["chat.view","/internal-chat"],["tracking.view","/job-tracker"],["master.view","/master-data"],["config.view","/settings"],["guide.view","/logic-guide"],["training.view","/training"],["security.manage","/users-permissions"]];return order.find(([p])=>ctx.permissions.has(p))?.[1]||"/access-denied";}
