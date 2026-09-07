import {getAccessContext} from "@/lib/security/access";
/** Aiven-backed application session guard. */
export async function requireUser(){const access=await getAccessContext();if(!access)throw new Error("UNAUTHENTICATED");if(!access.active)throw new Error("FORBIDDEN");return {id:access.userId,email:access.email,displayName:access.displayName};}
