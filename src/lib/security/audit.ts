import type {PoolClient} from "pg";
import type {AccessContext} from "@/lib/security/access";
export async function writeAudit(c:PoolClient,ctx:AccessContext,args:{action:string;entityType?:string;entityId?:string|number|null;summary?:string;before?:unknown;after?:unknown;metadata?:unknown}){
 await c.query(`insert into app_audit_log(user_id,email,action,entity_type,entity_id,summary,before_json,after_json,metadata_json)
 values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,[
  ctx.userId,ctx.email,args.action,args.entityType||null,args.entityId==null?null:String(args.entityId),args.summary||null,
  JSON.stringify(args.before??null),JSON.stringify(args.after??null),JSON.stringify(args.metadata??null)
 ]);
}
