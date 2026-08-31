import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";

// v341: lazy-load giá trị distinct cho cột điều kiện MD:REQ:<code>.
// Trang Công thức & Rule KHÔNG tải toàn bộ md_process_requirement (2.1M rows)
// mỗi lần mở nữa — chỉ fetch giá trị của đúng mã yêu cầu khi người dùng chọn
// cột đó trong builder "Áp dụng cho Job".
export async function GET(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 const column=(req.nextUrl.searchParams.get("column")||"").trim().toUpperCase();
 if(!column.startsWith("MD:REQ:"))
  return NextResponse.json({error:"column phải bắt đầu bằng MD:REQ:."},{status:400});
 const code=column.slice("MD:REQ:".length).trim();
 if(!code)
  return NextResponse.json({error:"Thiếu mã yêu cầu (MD:REQ:<code>)."},{status:400});
 const c=await getPool().connect();
 try{
  const q=await c.query(`
    select distinct requirement_value
    from md_process_requirement
    where is_active=true
      and upper(trim(requirement_code))=upper(trim($1))
      and nullif(trim(requirement_value),'') is not null
    order by requirement_value
  `,[code]);
  return NextResponse.json({
   column:`MD:REQ:${code}`,
   values:q.rows.map((r:any)=>String(r.requirement_value))
  },{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }finally{c.release();}
}
