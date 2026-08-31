"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

// v333: login page thực sự — trước đây /login chỉ redirect nên không có cách
// nào tạo Supabase session trên production (Vercel) → mọi API trả 401.
export function LoginForm(){
 const router=useRouter();
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [msg,setMsg]=useState("");
 const [busy,setBusy]=useState(false);

 async function login(e:React.FormEvent){
  e.preventDefault();
  setBusy(true);
  setMsg("");
  const s=createClient();
  const {error}=await s.auth.signInWithPassword({email,password});
  if(error){
   setMsg(error.message);
   setBusy(false);
   return;
  }
  router.push("/planning");
  router.refresh();
 }

 return <div className="card login">
  <h1>ST Planning</h1>
  <p className="muted">Đăng nhập để sử dụng hệ thống.</p>
  <form onSubmit={login} style={{display:"grid",gap:12}}>
   <input className="input" placeholder="Email" type="email" value={email}
    onChange={e=>setEmail(e.target.value)} autoComplete="email" required/>
   <input className="input" placeholder="Password" type="password" value={password}
    onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/>
   {msg&&<div className="notice" style={{background:"#fdecea",borderColor:"#f5b5ab",color:"#b42318"}}>{msg}</div>}
   <button className="btn primary" disabled={busy}>{busy?"Đang đăng nhập...":"Đăng nhập"}</button>
  </form>
 </div>;
}
