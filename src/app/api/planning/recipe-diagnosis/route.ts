import{NextRequest,NextResponse}from"next/server";
import{getPool}from"@/lib/db";
import{requireApiPermission}from"@/lib/security/api";
import{diagnoseJobRecipe,loadRecipeComparison}from"@/lib/planning/recipe-diagnosis";

const clean=(v:unknown)=>String(v??"").trim();

/**
 * POST /api/planning/recipe-diagnosis
 * - mode "job": chẩn đoán 1 Job cụ thể (vì sao chưa có Recipe).
 * - mode "compare": so sánh cấu hình Recipe ↔ nhu cầu trên board.
 */
export async function POST(req:NextRequest){
 const {denied}=await requireApiPermission("planning.edit");
 if(denied)return denied;
 try{
  const body=await req.json();
  const mode=clean(body.mode)||"job";
  const c=await getPool().connect();
  try{
   if(mode==="compare"){
    const data=await loadRecipeComparison(c);
    return NextResponse.json({ok:true,...data});
   }

   // mode "job": cần job info từ client (tránh phải query lại toàn bộ chain).
   const sourceOperationCode=clean(body.source_operation_code);
   const standardOperation=clean(body.standard_operation);
   const partNum=clean(body.part_num)||null;
   const revisionNum=clean(body.revision_num)||null;
   const sourceData=(body.source_data&&typeof body.source_data==="object")?body.source_data:null;

   if(!sourceOperationCode||!standardOperation)
    return NextResponse.json({error:"Thiếu Operation Code / Standard Operation."},{status:400});

   const diagnosis=await diagnoseJobRecipe(c,{
    sourceOperationCode,
    standardOperation,
    partNum,
    revisionNum,
    sourceData
   });
   return NextResponse.json({ok:true,...diagnosis});
  }finally{c.release();}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}
