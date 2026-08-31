import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";

/** Protects server mutation/read APIs with the signed-in Supabase user.
 * Returns a response only when access must be denied; callers return it immediately.
 */
export async function requireApiUser(){
  try{
    await requireUser();
    return null;
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(message==="FORBIDDEN"){
      return NextResponse.json({error:"Bạn không có quyền sử dụng chức năng này."},{status:403});
    }
    return NextResponse.json({error:"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."},{status:401});
  }
}
