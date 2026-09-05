import {NextResponse} from "next/server";
import {getAccessContext,scopeAllows,type AccessContext} from "@/lib/security/access";
import type {PermissionKey,ScopeType} from "@/lib/security/permissions";

export async function requireApiPermission(permission:PermissionKey,scope?:{type:ScopeType;key?:string|null}){
 const ctx=await getAccessContext();
 if(!ctx)return {denied:NextResponse.json({error:"Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."},{status:401}),ctx:null as AccessContext|null};
 if(!ctx.active)return {denied:NextResponse.json({error:"Tài khoản đang bị khóa hoặc chưa được Admin cấp quyền."},{status:403}),ctx};
 if(!ctx.permissions.has(permission))return {denied:NextResponse.json({error:`Bạn không có quyền ${permission}.`},{status:403}),ctx};
 if(scope&&!scopeAllows(ctx,scope.type,scope.key))return {denied:NextResponse.json({error:`Bạn không có quyền trên phạm vi ${scope.type}: ${scope.key||""}.`},{status:403}),ctx};
 return {denied:null,ctx};
}
