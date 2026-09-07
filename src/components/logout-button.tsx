"use client";
import {useRouter} from "next/navigation";
export function LogoutButton({presentation="legacy"}:{presentation?:"legacy"|"erp"}={}){const router=useRouter();const erpMode=presentation==="erp";return <button className={erpMode?"erpkit-user-action":"btn"} style={erpMode?undefined:{padding:"5px 10px",fontSize:12}} onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"}).catch(()=>{});router.push("/login");router.refresh();}}>Đăng xuất</button>;}
