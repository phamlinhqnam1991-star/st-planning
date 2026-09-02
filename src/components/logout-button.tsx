"use client";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export function LogoutButton({presentation="legacy"}:{presentation?:"legacy"|"erp"}={}){
 const router=useRouter();
 const erpMode=presentation==="erp";
 return <button className={erpMode?"erpkit-user-action":"btn"} style={erpMode?undefined:{padding:"5px 10px",fontSize:12}}
  onClick={async()=>{
   await createClient().auth.signOut();
   router.push("/login");
   router.refresh();
  }}>Đăng xuất</button>;
}
