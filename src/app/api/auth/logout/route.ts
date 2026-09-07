import {NextResponse} from "next/server";
import {readSessionToken,revokeSessionToken,SESSION_COOKIE} from "@/lib/security/session";
export async function POST(){const token=await readSessionToken();await revokeSessionToken(token).catch(()=>{});const res=NextResponse.json({ok:true});res.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0});return res;}
