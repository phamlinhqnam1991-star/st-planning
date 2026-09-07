import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {redirect} from "next/navigation";
import {firstAllowedPath,getAccessContext} from "@/lib/security/access";
import {LoginForm} from "@/components/login-form";
export const dynamic="force-dynamic";
export default async function LoginPage(){const access=await getAccessContext();if(access)redirect(access.active?firstAllowedPath(access):"/access-denied?reason=inactive");return <main className="erp-shell erpkit-migrated-page"><ErpAppHeader module="LOGIN"/><LoginForm/></main>;}
