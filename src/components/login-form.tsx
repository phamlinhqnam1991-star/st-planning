"use client";
import { useState } from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import { createClient } from "@/lib/supabase/client";
export function LoginForm(){
 const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [msg,setMsg]=useState(""); const [busy,setBusy]=useState(false);
 async function login(){setBusy(true);setMsg("");const s=createClient();const {error}=await s.auth.signInWithPassword({email,password}); if(error){setMsg(error.message);setBusy(false);return} window.location.href="/"}
 return <div className="card login"><h1>ST Planning</h1><p className="muted">Đăng nhập để quản lý Master Data.</p><div style={{display:"grid",gap:12}}><input className="input" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="btn primary" disabled={busy} onClick={login}>{busy?"Đang đăng nhập...":"Đăng nhập"}</button></div></div>
}
