import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {invalidateConfigHealth} from "@/lib/config/config-health";

const clean=(v:unknown)=>String(v??"").trim();
const normalizeCode=(v:unknown)=>clean(v).toUpperCase();
const normalizeRecipeNo=(v:unknown)=>{
 const x=clean(v);
 return /^\d+$/.test(x)?x.padStart(3,"0"):x.toUpperCase();
};
const makeKey=(family:string,group:string,no:string)=>`${family}|${group}|${no}`;
const makeBatchKey=(family:string,group:string,name:string)=>
 `${family}|${group}|${(name||"UNMAPPED").toUpperCase()}`;

function validateInput(body:any){
 const family=normalizeCode(body.process_family);
 const group=normalizeCode(body.recipe_group);
 const groupSource=clean(body.recipe_group_source_column)||null;
 const noSource=clean(body.recipe_no_source_column)||null;
 const nameSource=clean(body.recipe_name_source_column)||null;

 // v285: Source Column chỉ là nơi lấy dropdown. Khi Recipe No đến từ
 // All Open Job, lưu đúng VALUE planner đã chọn; không upper-case VALUE rồi
 // quay lại dùng giá trị đã biến đổi để validate source. Legacy/manual numeric
 // recipe vẫn giữ padding 3 số như trước.
 const selectedNo=clean(body.recipe_no);
 const no=noSource?selectedNo:normalizeRecipeNo(selectedNo);
 const name=clean(body.recipe_name);
 if(!family||!group||!no)
  return {error:"Process Family, Recipe Group và Recipe No là bắt buộc."} as const;
 if(/[|]/.test(family)||/[|]/.test(group)||/[|]/.test(no))
  return {error:"Process Family, Recipe Group và Recipe No không được chứa ký tự |."} as const;
 // v340: Recipe Name đi vào recipe_key của variant (family|group|no|NAME) nên
 // cũng không được chứa ký tự | (và | phá luôn batch_key family|group|NAME).
 if(name&&/[|]/.test(name))
  return {error:"Recipe Name không được chứa ký tự |."} as const;
 if(noSource&&!selectedNo)return {error:"Đã chọn cột nguồn Recipe No nhưng chưa chọn giá trị."} as const;
 if(nameSource&&!name)return {error:"Đã chọn cột nguồn Recipe Name nhưng chưa chọn giá trị."} as const;
 return {family,group,no,selectedNo,name,groupSource,noSource,nameSource,note:clean(body.note)||null,batchKey:clean(body.batch_key)||null} as const;
}

async function assertOpenJobSelection(c:any,column:string|null,value?:string|null,label?:string){
 if(!column)return;
 // v285: Open Job values come from Excel/raw source and can differ only by
 // case or surrounding spaces. Validate normalized source values to avoid
 // false warnings, while md_process_recipe still stores the selected VALUE.
 const q=value==null
  ? await c.query(`
      select 1
      from md_open_job_column_value
      where upper(trim(source_column))=upper(trim($1))
        and is_active=true
      limit 1
    `,[column])
  : await c.query(`
      select 1
      from md_open_job_column_value
      where upper(trim(source_column))=upper(trim($1))
        and upper(trim(source_value))=upper(trim($2))
        and is_active=true
      limit 1
    `,[column,value]);
 if(!q.rowCount)throw new Error(value==null
  ? `${label||"Cột"} không còn tồn tại/active trong Open Job Column Values: ${column}`
  : `${label||"Giá trị"} không còn tồn tại/active trong Open Job Column Values: ${column} = ${value}`);
}

/** Recipe Catalog (md_process_recipe).
 * recipe_key is immutable after creation because it is referenced by mappings,
 * planning rows, batches and schedules. Editing family/group/no would break
 * that history, therefore PATCH changes only display/configuration fields.
 */
export async function POST(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
  const input=validateInput(b);
  if("error" in input)return NextResponse.json({error:input.error},{status:400});
  const {family,group,no,selectedNo,name,groupSource,noSource,nameSource,note,batchKey}=input;
  const key=makeKey(family,group,no);
  const c=await getPool().connect();
  try{
   await c.query("begin");
   await assertOpenJobSelection(c,groupSource,null,"Recipe Group");
   await assertOpenJobSelection(c,noSource,selectedNo,"Recipe No");
   await assertOpenJobSelection(c,nameSource,name||null,"Recipe Name");

   // v340: 1 Recipe No có thể có NHIỀU Recipe Name.
   // - Cùng No + cùng Name → edit/reactivate đúng recipe đó (hành vi cũ khi trùng tên).
   // - Cùng No nhưng khác Name → tạo VARIANT riêng: recipe_key = family|group|no|NAME.
   // - Chưa có recipe nào cho No → tạo mới key canonical family|group|no (giữ cũ).
   const nameNorm=normalizeCode(name||"");

   const sameIdentity=await c.query(`
     select recipe_key,is_active
     from md_process_recipe
     where process_family=$1
       and recipe_group=$2
       and upper(trim(coalesce(recipe_no,'')))=upper(trim($3))
       and ($4='' or upper(trim(coalesce(recipe_name,'')))=$4)
     order by is_active desc,case when source_system='MANUAL' then 0 else 1 end,updated_at desc
     limit 1
     for update
   `,[family,group,no,nameNorm]);

   if(sameIdentity.rowCount){
    const recipeKey=String(sameIdentity.rows[0].recipe_key);
    await c.query(`
      update md_process_recipe
      set recipe_name=$2,
          recipe_group_source_column=coalesce($3,recipe_group_source_column),
          recipe_no_source_column=coalesce($4,recipe_no_source_column),
          recipe_name_source_column=$5,
          batch_key=$6,
          source_system='MANUAL',
          note=$7,
          is_active=true,
          updated_at=now()
      where recipe_key=$1
    `,[recipeKey,name||null,groupSource,noSource,nameSource,batchKey||makeBatchKey(family,group,name),note]);
    await c.query("commit");
    invalidateConfigHealth();
    return NextResponse.json({ok:true,recipe_key:recipeKey,updated:true,reactivated:!sameIdentity.rows[0].is_active});
   }

   const anyNo=await c.query(`
     select recipe_key,is_active
     from md_process_recipe
     where process_family=$1
       and recipe_group=$2
       and upper(trim(coalesce(recipe_no,'')))=upper(trim($3))
     order by is_active desc,case when source_system='MANUAL' then 0 else 1 end,updated_at desc
     limit 1
     for update
   `,[family,group,no]);

   if(anyNo.rowCount){
    // Đã có Recipe cùng No nhưng KHÁC tên → tạo variant riêng.
    if(!nameNorm)
     throw new Error(`Recipe No ${no} đã tồn tại. Hãy nhập Recipe Name để tạo thêm Recipe (1 Recipe No có thể có nhiều Recipe Name).`);
    const variantKey=`${key}|${nameNorm}`;
    const variant=await c.query(`
      select recipe_key,is_active
      from md_process_recipe
      where recipe_key=$1
      for update
    `,[variantKey]);

    if(variant.rowCount){
     await c.query(`
      update md_process_recipe
      set recipe_name=$2,
          recipe_group_source_column=coalesce($3,recipe_group_source_column),
          recipe_no_source_column=coalesce($4,recipe_no_source_column),
          recipe_name_source_column=$5,
          batch_key=$6,
          source_system='MANUAL',
          note=$7,
          is_active=true,
          updated_at=now()
      where recipe_key=$1
     `,[variantKey,name||null,groupSource,noSource,nameSource,batchKey||makeBatchKey(family,group,name),note]);
     await c.query("commit");
     invalidateConfigHealth();
     return NextResponse.json({ok:true,recipe_key:variantKey,updated:true,variant:true,reactivated:!variant.rows[0].is_active});
    }

    await c.query(`
     insert into md_process_recipe(
       recipe_key,process_family,recipe_group,recipe_group_source_column,
       recipe_no,recipe_no_source_column,recipe_name,recipe_name_source_column,
       batch_key,source_system,note,is_active
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL',$10,true)
    `,[variantKey,family,group,groupSource,no,noSource,name||null,nameSource,batchKey||makeBatchKey(family,group,name),note]);
    await c.query("commit");
    invalidateConfigHealth();
    return NextResponse.json({ok:true,recipe_key:variantKey,created:true,variant:true});
   }

   await c.query(`
     insert into md_process_recipe(
       recipe_key,process_family,recipe_group,recipe_group_source_column,
       recipe_no,recipe_no_source_column,recipe_name,recipe_name_source_column,
       batch_key,source_system,note,is_active
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'MANUAL',$10,true)
   `,[key,family,group,groupSource,no,noSource,name||null,nameSource,batchKey||makeBatchKey(family,group,name),note]);
   await c.query("commit");
   invalidateConfigHealth();
   return NextResponse.json({ok:true,recipe_key:key,created:true});
  }catch(error){
   await c.query("rollback");
   throw error;
  }finally{c.release()}
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:500});
 }
}

export async function PATCH(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
  const key=clean(b.recipe_key);
  if(!key)return NextResponse.json({error:"recipe_key không hợp lệ."},{status:400});

  const c=await getPool().connect();
  try{
   await c.query("begin");
   const current=await c.query(`
     select process_family,recipe_group,recipe_no,
            recipe_group_source_column,recipe_no_source_column,recipe_name_source_column
     from md_process_recipe
     where recipe_key=$1
     for update
   `,[key]);
   if(!current.rowCount){
    await c.query("rollback");
    return NextResponse.json({error:"Không tìm thấy Recipe."},{status:404});
   }

   const family=String(current.rows[0].process_family);
   const group=String(current.rows[0].recipe_group);
   const originalNo=String(current.rows[0].recipe_no||"");
   const currentNoSource=clean(current.rows[0].recipe_no_source_column)||null;
   const requestedNoRaw=clean(b.recipe_no);
   const requestedNo=currentNoSource?requestedNoRaw:normalizeRecipeNo(requestedNoRaw);
   const requestedFamily=normalizeCode(b.process_family);
   const requestedGroup=normalizeCode(b.recipe_group);
   const requestedGroupSource=clean(b.recipe_group_source_column)||null;
   const requestedNoSource=clean(b.recipe_no_source_column)||null;
   const requestedNameSource=clean(b.recipe_name_source_column)||null;
   const currentGroupSource=clean(current.rows[0].recipe_group_source_column)||null;

   // recipe_key contains Family|Group|No and is referenced throughout history.
   if((requestedNo&&requestedNo!==originalNo)||
      (requestedFamily&&requestedFamily!==family)||
      (requestedGroup&&requestedGroup!==group)||
      (currentGroupSource&&requestedGroupSource&&requestedGroupSource!==currentGroupSource)||
      (currentNoSource&&requestedNoSource&&requestedNoSource!==currentNoSource)){
    throw new Error("Không thể đổi Process Family, Recipe Group hoặc Recipe No sau khi tạo vì Recipe đã có khóa liên kết lịch sử. Hãy tạo Recipe mới, map Operation Code sang Recipe mới, rồi ngưng Recipe cũ khi không còn dùng.");
   }

   const name=clean(b.recipe_name);
   await assertOpenJobSelection(c,requestedNameSource,name||null,"Recipe Name");
   const batch=clean(b.batch_key)||makeBatchKey(family,group,name);
   await c.query(`
     update md_process_recipe
     set recipe_name=$2,
         recipe_group_source_column=coalesce(recipe_group_source_column,$3),
         recipe_no_source_column=coalesce(recipe_no_source_column,$4),
         recipe_name_source_column=$5,
         batch_key=$6,
         source_system='MANUAL',
         note=$7,
         is_active=true,
         updated_at=now()
     where recipe_key=$1
   `,[key,name||null,requestedGroupSource,requestedNoSource,requestedNameSource,batch,clean(b.note)||null]);
   await c.query("commit");
  }catch(error){
   await c.query("rollback");
   throw error;
  }finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }
}

/** Soft deactivate only. We deliberately preserve batches/schedules/history.
 * Runtime mappings are disabled in the same transaction, so Planning Board
 * cannot propose an inactive Recipe. Active part mappings block deactivation
 * because their master-import fallback must remain internally consistent.
 */
export async function DELETE(req:NextRequest){
 const denied=await requireApiUser();
 if(denied)return denied;
 try{
  const b=await req.json();
  const key=clean(b.recipe_key);
  if(!key)return NextResponse.json({error:"recipe_key không hợp lệ."},{status:400});
  const c=await getPool().connect();
  try{
   await c.query("begin");
   const exists=await c.query(`select recipe_key from md_process_recipe where recipe_key=$1 for update`,[key]);
   if(!exists.rowCount)throw new Error("Không tìm thấy Recipe.");

   const partUse=await c.query(`
     select count(*)::int n
     from md_part_process_recipe
     where recipe_key=$1 and is_active=true
   `,[key]);
   if(Number(partUse.rows[0]?.n||0)>0)
    throw new Error(`Recipe đang được ${partUse.rows[0].n} Part/Revision sử dụng. Không thể ngưng trực tiếp. Hãy thay/gỡ Part → Recipe trước, hoặc giữ Recipe active làm fallback.`);

   const batchUse=await c.query(`
     select count(*)::int n
     from planning_batch
     where recipe_key=$1 and status<>'CANCELLED'
   `,[key]);
   if(Number(batchUse.rows[0]?.n||0)>0)
    throw new Error(`Recipe đang được ${batchUse.rows[0].n} Batch hoạt động sử dụng. Không thể ngưng cho đến khi các Batch đó hoàn tất hoặc bị hủy.`);

   await c.query(`
     update md_main_operation_recipe
     set is_active=false,is_default=false,updated_at=now()
     where recipe_key=$1 and is_active=true
   `,[key]);
   await c.query(`
     update md_operation_recipe_mapping
     set is_active=false,is_default=false,updated_at=now()
     where recipe_key=$1 and is_active=true
   `,[key]);
   await c.query(`
     update md_process_recipe
     set is_active=false,updated_at=now()
     where recipe_key=$1
   `,[key]);
   await c.query("commit");
  }catch(error){
   await c.query("rollback");
   throw error;
  }finally{c.release()}
  invalidateConfigHealth();
  return NextResponse.json({ok:true});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
 }
}
