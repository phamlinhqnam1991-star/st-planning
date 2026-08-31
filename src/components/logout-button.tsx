"use client";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export function LogoutButton(){
 const router=useRouter();
 return <button className="btn" style={{padding:"5px 10px",fontSize:12}}
  onClick={async()=>{
   await createClient().auth.signOut();
   router.push("/login");
   router.refresh();
  }}>Đăng xuất</button>;
}
