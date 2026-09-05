import {createHash,randomBytes,randomUUID} from "node:crypto";
import {cookies} from "next/headers";
import {getPool} from "@/lib/db";
export const SESSION_COOKIE="st_planning_session";
export function hashSessionToken(token:string){return createHash("sha256").update(token).digest("hex");}
function sessionHours(){const n=Number(process.env.SESSION_HOURS||12);return Number.isFinite(n)?Math.min(168,Math.max(1,Math.trunc(n))):12;}
export async function readSessionToken(){return (await cookies()).get(SESSION_COOKIE)?.value||null;}
export async function createSession(userId:string,meta?:{userAgent?:string;ipAddress?:string}){
 const token=randomBytes(32).toString("base64url");const tokenHash=hashSessionToken(token);const id=randomUUID();const hours=sessionHours();
 await getPool().query(`insert into app_session(session_id,user_id,token_hash,expires_at,user_agent,ip_address) values($1,$2,$3,now()+($4||' hours')::interval,$5,$6)`,[id,userId,tokenHash,String(hours),meta?.userAgent||null,meta?.ipAddress||null]);
 return {token,hours};
}
export async function revokeSessionToken(token:string|null|undefined){if(!token)return;await getPool().query(`update app_session set revoked_at=coalesce(revoked_at,now()) where token_hash=$1`,[hashSessionToken(token)]);}
