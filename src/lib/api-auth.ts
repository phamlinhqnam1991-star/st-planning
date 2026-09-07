import {NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
/** @deprecated V477 routes should call requireApiPermission(permission) instead. */
export async function requireApiUser(){
 try{await requireUser();return null;}catch(error){const message=error instanceof Error?error.message:String(error);if(message==="FORBIDDEN")return NextResponse.json({error:"Bạn không có quyền sử dụng chức năng này."},{status:403});return NextResponse.json({error:"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."},{status:401});}
}
