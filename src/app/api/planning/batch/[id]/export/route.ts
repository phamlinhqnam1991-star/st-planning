import ExcelJS from "exceljs";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";
import {canPlanningMain} from "@/lib/security/scope-db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const clean=(value:unknown)=>String(value??"").trim();
const safeSheetName=(value:string)=>clean(value).replace(/[\\/*?:\[\]]/g,"_").slice(0,31)||"Batch Jobs";
const safeFileName=(value:string)=>clean(value).replace(/[^A-Za-z0-9._-]+/g,"_").replace(/^_+|_+$/g,"")||"batch";

export async function GET(
 _req:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const {denied,ctx}=await requireApiPermission("planning.view");
 if(denied||!ctx)return denied!;

 const {id}=await params;
 const batchId=Number(id);
 if(!Number.isFinite(batchId))return NextResponse.json({error:"Batch không hợp lệ."},{status:400});

 const c=await getPool().connect();
 try{
  const batchQ=await c.query(`
   select b.id,b.batch_no,b.standard_operation,b.recipe_key,b.status
   from planning_batch b
   where b.id=$1
  `,[batchId]);
  if(!batchQ.rowCount)return NextResponse.json({error:"Không tìm thấy Batch."},{status:404});

  const batch=batchQ.rows[0];
  if(!canPlanningMain(ctx,batch.standard_operation)){
   return NextResponse.json({error:`Không có quyền xem Main ${batch.standard_operation}.`},{status:403});
  }

  const jobsQ=await c.query(`
   select
    bj.job_num,
    bj.qty,
    bj.surface_dm2,
    coalesce(nullif(bj.source_operation_code,''),p.source_operation_code) operation_code,
    coalesce(nullif(p.previous_standard_operation_snapshot,''),'START') previous_operation,
    nextp.standard_operation next_main_operation,
    j.part_num,j.revision_num,j.priority_type,
    mf.primer1,mf.primer2,mf.primer3,
    coalesce(br.recipe_no,pr.recipe_no) recipe_no,
    coalesce(br.recipe_name,pr.recipe_name) recipe_name
   from planning_batch_job bj
   join planning_batch b on b.id=bj.batch_id
   left join planning_job_operation p on p.id=bj.planning_job_operation_id
   left join open_job_current j on j.job_num=bj.job_num
   left join md_material_finish mf
     on mf.part_num=j.part_num
    and mf.revision_num=j.revision_num
    and mf.is_active=true
   left join md_process_recipe br on br.recipe_key=b.recipe_key and br.is_active=true
   left join md_process_recipe pr on pr.recipe_key=p.recipe_key and pr.is_active=true
   left join lateral (
    select p2.standard_operation
    from planning_job_operation p2
    where p2.job_num=bj.job_num
      and p2.is_active=true
      and p2.standard_operation<>'PIONBL'
      and p2.planning_seq>coalesce(p.planning_seq,bj.planning_seq_snapshot,-1)
    order by p2.planning_seq,p2.id
    limit 1
   ) nextp on true
   where bj.batch_id=$1
   order by bj.job_num,bj.id
  `,[batchId]);

  const workbook=new ExcelJS.Workbook();
  workbook.creator="ST Planning";
  workbook.created=new Date();
  workbook.modified=new Date();

  const sheet=workbook.addWorksheet(safeSheetName(batch.batch_no||"Batch Jobs"),{
   views:[{state:"frozen",ySplit:1}]
  });

  const headers=[
   "Job","Part / Rev","Qty","Surface","Operation Code","Previous Operation",
   "Next Main Operation","Recipe","Primer 1","Primer 2","Primer 3","Priority","Status","Batches"
  ];
  sheet.addRow(headers);

  for(const row of jobsQ.rows){
   const partRev=[clean(row.part_num)||"—",clean(row.revision_num)?`Rev ${clean(row.revision_num)}`:""].filter(Boolean).join("\n");
   const recipe=[clean(row.recipe_no)||"—",clean(row.recipe_name)].filter(Boolean).join("\n");
   sheet.addRow([
    clean(row.job_num),
    partRev,
    Number(row.qty??0),
    Number(row.surface_dm2??0),
    clean(row.operation_code)||"—",
    clean(row.previous_operation)||"START",
    clean(row.next_main_operation)||"—",
    recipe,
    clean(row.primer1)||"—",
    clean(row.primer2)||"—",
    clean(row.primer3)||"—",
    clean(row.priority_type)||"—",
    "BATCHES",
    clean(batch.batch_no)||"—"
   ]);
  }

  sheet.autoFilter="A1:N1";
  sheet.properties.defaultRowHeight=20;
  sheet.getRow(1).height=26;
  sheet.getRow(1).font={bold:true,color:{argb:"FF17324D"},size:10};
  sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE7EEF5"}};
  sheet.getRow(1).alignment={vertical:"middle",horizontal:"left"};

  const widths=[18,26,9,12,18,18,22,34,28,28,28,14,14,18];
  widths.forEach((width,index)=>{sheet.getColumn(index+1).width=width;});
  sheet.getColumn(3).numFmt="0.##";
  sheet.getColumn(4).numFmt="#,##0.00";

  for(let r=2;r<=sheet.rowCount;r++){
   const excelRow=sheet.getRow(r);
   excelRow.alignment={vertical:"top",wrapText:true};
   excelRow.height=32;
   for(let cidx=1;cidx<=headers.length;cidx++){
    const cell=excelRow.getCell(cidx);
    cell.border={
     top:{style:"thin",color:{argb:"FFD9E2EC"}},
     left:{style:"thin",color:{argb:"FFD9E2EC"}},
     bottom:{style:"thin",color:{argb:"FFD9E2EC"}},
     right:{style:"thin",color:{argb:"FFD9E2EC"}}
    };
   }
   const priority=clean(excelRow.getCell(12).value).toUpperCase();
   if(priority==="CAT3"||priority==="CAT5"){
    excelRow.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF1EE"}};
    excelRow.getCell(12).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFD8D0"}};
    excelRow.getCell(12).font={bold:true,color:{argb:"FF9A3412"}};
   }
   excelRow.getCell(13).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFE8F7EF"}};
   excelRow.getCell(13).font={bold:true,color:{argb:"FF067647"}};
  }

  const output=new Uint8Array(await workbook.xlsx.writeBuffer());
  const filename=`${safeFileName(batch.batch_no)}_Jobs.xlsx`;
  return new NextResponse(output,{
   status:200,
   headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":`attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control":"no-store"
   }
  });
 }finally{
  c.release();
 }
}
