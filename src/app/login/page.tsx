import {ErpAppHeader} from "@/components/erp/erp-app-header";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {LoginForm} from "@/components/login-form";

// v333: đã đăng nhập rồi thì vào thẳng Planning Board.
export const dynamic="force-dynamic";

export default async function LoginPage(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(user)redirect("/planning");

 return <main className="erp-shell erpkit-migrated-page">
  <ErpAppHeader module="LOGIN"/>
  <LoginForm/>
 </main>;
}
