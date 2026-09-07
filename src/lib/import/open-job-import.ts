import ExcelJS from "exceljs";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";

type Obj=Record<string,unknown>;

const text=(v:unknown)=>{
 if(v==null)return "";
 if(v instanceof Date)return v.toISOString();
 if(typeof v==="object"){
  const x=v as Record<string,unknown>;
  if("result" in x && x.result!=null)return text(x.result);
  if("text" in x && x.text!=null)return text(x.text);
  if("richText" in x && Array.isArray(x.richText))
   return x.richText.map((r:any)=>String(r?.text??"")).join("");
 }
 return String(v).trim();
};

const numberValue=(v:unknown)=>{
 const x=text(v).replace(/,/g,"").trim();
 if(!x)return null;
 const n=Number(x);
 return Number.isFinite(n)?n:null;
};

const jsonValue=(v:unknown):unknown=>{
 if(v==null)return null;
 if(v instanceof Date)return v.toISOString();
 if(typeof v==="number"||typeof v==="boolean"||typeof v==="string")return v;
 if(typeof v==="object"){
  const x=v as Record<string,unknown>;
  if("result" in x)return jsonValue(x.result);
  if("text" in x)return jsonValue(x.text);
  if("richText" in x && Array.isArray(x.richText))
   return x.richText.map((r:any)=>String(r?.text??"")).join("");
  try{return JSON.parse(JSON.stringify(v))}
  catch{return text(v)}
 }
 return text(v);
};

const stableHash=(headers:string[],o:Obj)=>{
 // NEWJOB is an Excel helper/formula and is intentionally ignored.
 const payload=headers
   .filter(h=>h!=="NEWJOB")
   .map(h=>`${h}\u001e${text(o[h])}`)
   .join("\u001f");
 return createHash("sha256").update(payload).digest("hex");
};

const val=(o:Obj,key:string)=>text(o[key])||null;
const num=(o:Obj,key:string)=>numberValue(o[key]);

type Existing={
 source_hash:string;
 is_open:boolean;
};

export async function importOpenJobsXlsx(
 filePath:string,
 c:PoolClient,
 batchId:string
){
 const existingQ=await c.query(`
   select job_num,source_hash,is_open
   from public.open_job_current
 `);

 const existing=new Map<string,Existing>();
 for(const r of existingQ.rows){
   existing.set(String(r.job_num),{
     source_hash:String(r.source_hash),
     is_open:Boolean(r.is_open)
   });
 }

 const workbook=new ExcelJS.stream.xlsx.WorkbookReader(filePath,{
   worksheets:"emit",
   sharedStrings:"cache",
   styles:"ignore",
   hyperlinks:"ignore"
 });

 let sourceRows=0;
 let newJobs=0;
 let changedJobs=0;
 let unchangedJobs=0;
 let closedJobs=0;

 const seen=new Set<string>();
 const affectedOpenJobs=new Set<string>();
 const closedJobNums:string[]=[];

 const currentRows:any[][]=[];
 const unchangedJobNums:string[]=[];
 const historyRows:any[][]=[];

 const flush=async(force=false)=>{
   if(currentRows.length>=750||force){
     if(currentRows.length){
       const cols=[
        "job_num","part_num","revision_num","program","part_cluster","part_description",
        "prod_qty","current_good_wip_qty","last_labor_qty",
        "last_operation","next_operation","all_operation",
        "total_surface","surface_per_part_dm2",
        "open_dmr","st","st_wip_area","wip_sequence",
        "priority_type","cat35_transit","impact_sale_value",
        "source_hash","source_data","is_open","last_import_status",
        "first_seen_at","last_seen_at","last_changed_at","closed_at",
        "last_import_batch_id","updated_at"
       ];

       const params:any[]=[];
       let p=1;
       const groups=currentRows.map(r=>`(${r.map(v=>{params.push(v);return `$${p++}`}).join(",")})`).join(",");
       await c.query(`
         insert into public.open_job_current(${cols.join(",")})
         values ${groups}
         on conflict(job_num)
         do update set
           part_num=excluded.part_num,
           revision_num=excluded.revision_num,
           program=excluded.program,
           part_cluster=excluded.part_cluster,
           part_description=excluded.part_description,
           prod_qty=excluded.prod_qty,
           current_good_wip_qty=excluded.current_good_wip_qty,
           last_labor_qty=excluded.last_labor_qty,
           last_operation=excluded.last_operation,
           next_operation=excluded.next_operation,
           all_operation=excluded.all_operation,
           total_surface=excluded.total_surface,
           surface_per_part_dm2=excluded.surface_per_part_dm2,
           open_dmr=excluded.open_dmr,
           st=excluded.st,
           st_wip_area=excluded.st_wip_area,
           wip_sequence=excluded.wip_sequence,
           priority_type=excluded.priority_type,
           cat35_transit=excluded.cat35_transit,
           impact_sale_value=excluded.impact_sale_value,
           source_hash=excluded.source_hash,
           source_data=excluded.source_data,
           is_open=true,
           last_import_status=excluded.last_import_status,
           last_seen_at=excluded.last_seen_at,
           last_changed_at=case
             when excluded.last_import_status in ('NEW','CHANGED')
               then excluded.last_changed_at
             else open_job_current.last_changed_at
           end,
           closed_at=null,
           last_import_batch_id=excluded.last_import_batch_id,
           updated_at=excluded.updated_at
       `,params);
       currentRows.length=0;
     }
   }

   if(unchangedJobNums.length>=1500||force){
     if(unchangedJobNums.length){
       const batch=unchangedJobNums.splice(0,unchangedJobNums.length);
       await c.query(`
         update public.open_job_current
         set last_import_status='UNCHANGED',
             last_seen_at=now(),
             last_import_batch_id=$2,
             updated_at=now()
         where job_num=any($1::text[])
           and is_open=true
       `,[batch,batchId]);
     }
   }

   if(historyRows.length>=1000||force){
     if(historyRows.length){
       const cols=[
         "job_num","import_batch_id","change_type",
         "part_num","revision_num","prod_qty","current_good_wip_qty","last_labor_qty",
         "last_operation","next_operation","total_surface",
         "source_hash","source_data","is_open","created_at"
       ];
       const params:any[]=[];
       let p=1;
       const groups=historyRows.map(r=>`(${r.map(v=>{params.push(v);return `$${p++}`}).join(",")})`).join(",");
       await c.query(
         `insert into public.open_job_history(${cols.join(",")}) values ${groups}`,
         params
       );
       historyRows.length=0;
     }
   }
 };

 let targetSheetFound=false;

 for await(const ws of workbook){
   if(targetSheetFound)break;

   let headers:string[]=[];
   let isTarget=false;

   for await(const row of ws){
     const values=(row.values as unknown[]).slice(1);

     if(!headers.length){
       headers=values.map(text);
       isTarget=headers.includes("JobNum");
       if(!isTarget)break;
       targetSheetFound=true;
       continue;
     }

     const o:Obj={};
     headers.forEach((h,i)=>{if(h)o[h]=values[i]});

     const jobNum=text(o.JobNum);
     if(!jobNum)continue;

     sourceRows++;
     seen.add(jobNum);

     const hash=stableHash(headers,o);
     const old=existing.get(jobNum);

     let status:"NEW"|"CHANGED"|"UNCHANGED";
     if(!old){
       status="NEW";
       newJobs++;
       affectedOpenJobs.add(jobNum);
     }else if(!old.is_open || old.source_hash!==hash){
       status="CHANGED";
       changedJobs++;
       affectedOpenJobs.add(jobNum);
     }else{
       status="UNCHANGED";
       unchangedJobs++;
     }

     const now=new Date();
     const firstSeen=old ? null : now;

     // Build the 140+ column JSON payload only for NEW/CHANGED Jobs.
     // UNCHANGED Jobs already have the exact same source_hash and keep their
     // existing source_data untouched.
     const sourceData:Record<string,unknown>|null=status==="UNCHANGED"?null:{};
     if(sourceData){
       headers.forEach(h=>{
         if(h && h!=="NEWJOB")sourceData[h]=jsonValue(o[h]);
       });
     }

     if(status==="UNCHANGED"){
       // v377: hash-identical rows keep their existing normalized/source_data
       // payload. Only lightweight import metadata is refreshed in bulk.
       unchangedJobNums.push(jobNum);
     }else{
       currentRows.push([
       jobNum,
       val(o,"EpicorPart"),
       val(o,"RevisionNum"),
       val(o,"Program"),
       val(o,"PartCluster"),
       val(o,"PartDescription"),

       num(o,"ProdQty"),
       num(o,"CurrentGoodWIPQty"),
       num(o,"LastLaborQty"),

       val(o,"LastLaborOp"),

       // SOURCE OF TRUTH FOR RAW NextOperation:
       // Imported directly from the All Open Job Excel column "NextOperation".
       // Example: MSKG-AND can appear here even when it has NO ST Operation Mapping.
       // Mapping is NOT the source of this value.
       val(o,"NextOperation"),

       val(o,"AllOperation"),

       num(o,"TotalSurface"),
       num(o,"Part_Masterlist.Surface (dm2)"),

       val(o,"OpenDMR"),
       val(o,"ST"),
       val(o,"STWIParea"),
       val(o,"WIPSequence"),

       val(o,"CAT&Sales.Priority type"),
       val(o,"CAT&Sales.CAT3/5 transit"),
       val(o,"CAT&Sales.Impact sale value"),

       hash,
       JSON.stringify(sourceData),
       true,
       status,
       firstSeen||now, // ON CONFLICT leaves existing first_seen_at unchanged
       now,
       now,
       null,
       batchId,
       now
       ]);
     }

     if(status!=="UNCHANGED"){
       historyRows.push([
         jobNum,batchId,status,
         val(o,"EpicorPart"),
         val(o,"RevisionNum"),
         num(o,"ProdQty"),
         num(o,"CurrentGoodWIPQty"),
         num(o,"LastLaborQty"),
         val(o,"LastLaborOp"),
         val(o,"NextOperation"),
         num(o,"TotalSurface"),
         hash,
         JSON.stringify(sourceData),
         true,
         now
       ]);
     }

     if(sourceRows%750===0)await flush();
   }
 }

 if(!targetSheetFound)
   throw new Error("Không tìm thấy sheet/header có cột JobNum.");

 await flush(true);

 // Jobs missing from the new full snapshot become CLOSED.
 const missing:string[]=[];
 for(const [job,old] of existing){
   if(old.is_open && !seen.has(job))missing.push(job);
 }

 for(let i=0;i<missing.length;i+=500){
   const batch=missing.slice(i,i+500);

   const closedQ=await c.query(`
     select job_num,part_num,revision_num,prod_qty,current_good_wip_qty,last_labor_qty,
            last_operation,next_operation,total_surface,source_hash,source_data
     from public.open_job_current
     where job_num=any($1::text[]) and is_open=true
   `,[batch]);

   const now=new Date();

   for(const r of closedQ.rows){
     historyRows.push([
       r.job_num,batchId,"CLOSED",
       r.part_num,r.revision_num,r.prod_qty,r.current_good_wip_qty,r.last_labor_qty,
       r.last_operation,r.next_operation,r.total_surface,
       r.source_hash,JSON.stringify(r.source_data||{}),false,now
     ]);
     closedJobs++;
     closedJobNums.push(String(r.job_num));
   }

   await c.query(`
     update public.open_job_current
     set is_open=false,
         last_import_status='CLOSED',
         closed_at=now(),
         last_changed_at=now(),
         last_import_batch_id=$2,
         updated_at=now()
     where job_num=any($1::text[]) and is_open=true
   `,[batch,batchId]);

   await flush();
 }

 await flush(true);

 return {
   sourceRows,
   newJobs,
   changedJobs,
   unchangedJobs,
   closedJobs,
   affectedOpenJobNums:[...affectedOpenJobs],
   closedJobNums
 };
}
