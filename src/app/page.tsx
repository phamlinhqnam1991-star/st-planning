import {redirect} from "next/navigation";
import {firstAllowedPath,getAccessContext} from "@/lib/security/access";
export const dynamic="force-dynamic";
export default async function Page(){
 const ctx=await getAccessContext();
 if(!ctx)redirect("/login");
 if(!ctx.active)redirect("/access-denied?reason=inactive");
 redirect(firstAllowedPath(ctx));
}
