"use client"; import { createClient } from "@/lib/supabase/client";
export function LogoutButton(){return <button className="btn" onClick={async()=>{await createClient().auth.signOut();location.href="/login"}}>Đăng xuất</button>}
