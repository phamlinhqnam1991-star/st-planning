import Link from "next/link";
import {LogoutButton} from "@/components/logout-button";
export default async function Page({searchParams}:{searchParams:Promise<{reason?:string}>}){
 const sp=await searchParams;const inactive=sp.reason==="inactive";
 return <main className="erp-shell"><section className="security-denied">
  <h1>{inactive?"Tài khoản chưa được cấp quyền":"Không có quyền truy cập"}</h1>
  <p>{inactive?"Tài khoản đã đăng nhập nhưng đang bị khóa hoặc chưa được Admin kích hoạt trong ST Planning.":"Bạn không được phân quyền cho chức năng này. Chỉ các tab được cấp quyền mới hiển thị trong menu."}</p>
  <div style={{display:"flex",gap:8}}><Link className="btn primary" href="/">Về trang được phép</Link><LogoutButton presentation="erp"/></div>
 </section></main>;
}
