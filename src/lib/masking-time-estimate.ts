import type {PoolClient} from "pg";

export type MaskingTimeBasis="JOB_TOTAL"|"PER_PIECE";
export type MaskingValueUnit="HOURS"|"MINUTES";

export type MaskingEstimateBreakdown={
 sourceColumn:string;
 areaCode:string;
 areaName:string;
 timeBasis:MaskingTimeBasis;
 valueUnit:MaskingValueUnit;
 workloadHours:number;
 allocatedPeople:number;
 estimatedMinutes:number|null;
 missingJobs:number;
 invalidJobs:number;
 valueJobs:number;
};

export type BatchMaskingEstimate={
 configured:boolean;
 workloadHours:number;
 allocatedPeople:number;
 estimatedMinutes:number|null;
 previousMainFinish:string|null;
 estimatedReady:string|null;
 sourceColumns:string[];
 physicalAreas:string[];
 missingJobs:number;
 invalidJobs:number;
 valueJobs:number;
 breakdown:MaskingEstimateBreakdown[];
 warnings:string[];
};

type ConfigRow={
 standard_operation:string;
 source_column:string;
 area_code:string;
 area_name:string;
 time_basis:MaskingTimeBasis;
 value_unit:MaskingValueUnit;
 allocated_people:number|string|null;
};

type JobRow={
 batch_id:number|string;
 standard_operation:string;
 job_num:string;
 qty:number|string|null;
 source_data:Record<string,unknown>|null;
 normalized_data:Record<string,unknown>|null;
};

const clean=(v:unknown)=>String(v??"").trim();
const upper=(v:unknown)=>clean(v).toUpperCase();
const finite=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0;};

export function parseMaskingTimeValue(value:unknown,unit:MaskingValueUnit):number|null{
 if(value==null)return null;
 const raw=clean(value);
 if(!raw)return null;
 let hours:number|null=null;
 const hhmm=raw.match(/^(\d{1,4}):([0-5]\d)$/);
 if(hhmm){
  hours=Number(hhmm[1])+Number(hhmm[2])/60;
 }else{
  const normalized=raw.replace(/\s/g,"").replace(/,/g,".");
  if(!/^[+-]?\d+(?:\.\d+)?$/.test(normalized))return Number.NaN;
  const n=Number(normalized);
  if(!Number.isFinite(n)||n<0)return Number.NaN;
  hours=unit==="MINUTES"?n/60:n;
 }
 return hours!=null&&Number.isFinite(hours)&&hours>=0?hours:Number.NaN;
}

function sourceValue(row:JobRow,column:string){
 const source=row.source_data&&typeof row.source_data==="object"?row.source_data:{};
 if(Object.prototype.hasOwnProperty.call(source,column))return source[column];
 const normalized=row.normalized_data&&typeof row.normalized_data==="object"?row.normalized_data:{};
 if(Object.prototype.hasOwnProperty.call(normalized,column))return normalized[column];
 // Excel/source headers are case-sensitive in JSONB, but keep a final case-insensitive fallback
 // so a renamed import casing does not silently drop the advisory estimate.
 const target=column.toUpperCase();
 for(const [k,v] of Object.entries(source))if(k.toUpperCase()===target)return v;
 for(const [k,v] of Object.entries(normalized))if(k.toUpperCase()===target)return v;
 return null;
}

function emptyEstimate():BatchMaskingEstimate{
 return {
  configured:false,workloadHours:0,allocatedPeople:0,estimatedMinutes:null,
  previousMainFinish:null,estimatedReady:null,sourceColumns:[],physicalAreas:[],
  missingJobs:0,invalidJobs:0,valueJobs:0,breakdown:[],warnings:[]
 };
}

/**
 * V512 Masking Estimate is advisory only.
 * It reads configured All Open Job time columns for Jobs already inside each Batch,
 * converts them to person-hours, and divides by configured Physical Area manpower.
 * No Planning Chain, READY/WAIT, Batch membership or Schedule data is modified.
 * Missing migration/table fails open: the Scheduling page still renders without estimates.
 */
export async function loadBatchMaskingEstimates(c:PoolClient,batchIds:number[]):Promise<Map<number,BatchMaskingEstimate>>{
 const ids=[...new Set(batchIds.map(Number).filter(Number.isFinite).filter(x=>x>0))];
 const out=new Map<number,BatchMaskingEstimate>();
 if(!ids.length)return out;
 try{
  const cfgQ=await c.query<ConfigRow>(`
   select
    upper(trim(m.standard_operation)) standard_operation,
    m.source_column,
    m.area_code,
    coalesce(a.area_name,m.area_code) area_name,
    m.time_basis,
    m.value_unit,
    coalesce(p.allocated_people,0) allocated_people
   from public.md_main_masking_time_column m
   left join public.md_area a on a.area_code=m.area_code
   left join public.md_masking_area_manpower p on p.area_code=m.area_code and p.is_active=true
   where m.is_active=true
   order by upper(trim(m.standard_operation)),m.sort_order,m.id
  `);
  if(!cfgQ.rowCount)return out;
  const byMain=new Map<string,ConfigRow[]>();
  for(const row of cfgQ.rows){
   const key=upper(row.standard_operation);
   if(!key)continue;
   byMain.set(key,[...(byMain.get(key)||[]),row]);
  }
  const jobQ=await c.query<JobRow>(`
   select
    bj.batch_id,
    b.standard_operation,
    bj.job_num,
    coalesce(bj.qty,j.current_good_wip_qty,j.prod_qty,0) qty,
    coalesce(j.source_data,'{}'::jsonb) source_data,
    to_jsonb(j)-'source_data' normalized_data
   from public.planning_batch_job bj
   join public.planning_batch b on b.id=bj.batch_id and b.status<>'CANCELLED'
   join public.open_job_current j on j.job_num=bj.job_num and j.is_open=true
   where bj.batch_id=any($1::bigint[])
   order by bj.batch_id,bj.job_num
  `,[ids]);
  const jobsByBatch=new Map<number,JobRow[]>();
  for(const row of jobQ.rows){
   const id=Number(row.batch_id);
   jobsByBatch.set(id,[...(jobsByBatch.get(id)||[]),row]);
  }
  for(const id of ids){
   const jobs=jobsByBatch.get(id)||[];
   const main=upper(jobs[0]?.standard_operation);
   const configs=byMain.get(main)||[];
   if(!configs.length)continue;
   const estimate=emptyEstimate();
   estimate.configured=true;
   const areas=new Set<string>();
   const columns=new Set<string>();
   let totalMinutes=0;
   let durationKnown=true;
   const uniquePeople=new Set<number>();
   for(const cfg of configs){
    const people=Math.max(0,finite(cfg.allocated_people));
    if(people>0)uniquePeople.add(people);
    const breakdown:MaskingEstimateBreakdown={
     sourceColumn:clean(cfg.source_column),areaCode:clean(cfg.area_code),areaName:clean(cfg.area_name)||clean(cfg.area_code),
     timeBasis:cfg.time_basis==="PER_PIECE"?"PER_PIECE":"JOB_TOTAL",
     valueUnit:cfg.value_unit==="MINUTES"?"MINUTES":"HOURS",
     workloadHours:0,allocatedPeople:people,estimatedMinutes:null,missingJobs:0,invalidJobs:0,valueJobs:0
    };
    columns.add(breakdown.sourceColumn);
    areas.add(breakdown.areaName);
    for(const job of jobs){
     const raw=sourceValue(job,breakdown.sourceColumn);
     const parsed=parseMaskingTimeValue(raw,breakdown.valueUnit);
     if(parsed===null){breakdown.missingJobs+=1;continue;}
     if(Number.isNaN(parsed)){breakdown.invalidJobs+=1;continue;}
     const qty=Math.max(0,finite(job.qty));
     breakdown.workloadHours+=breakdown.timeBasis==="PER_PIECE"?parsed*qty:parsed;
     breakdown.valueJobs+=1;
    }
    if(breakdown.workloadHours<=0){
     breakdown.estimatedMinutes=0;
    }else if(people>0){
     breakdown.estimatedMinutes=Math.ceil((breakdown.workloadHours/people)*60);
     totalMinutes+=breakdown.estimatedMinutes;
    }else{
     durationKnown=false;
    }
    estimate.workloadHours+=breakdown.workloadHours;
    estimate.missingJobs+=breakdown.missingJobs;
    estimate.invalidJobs+=breakdown.invalidJobs;
    estimate.valueJobs+=breakdown.valueJobs;
    estimate.breakdown.push(breakdown);
   }
   estimate.workloadHours=Math.round(estimate.workloadHours*10000)/10000;
   estimate.sourceColumns=[...columns];
   estimate.physicalAreas=[...areas];
   estimate.allocatedPeople=uniquePeople.size===1?[...uniquePeople][0]:uniquePeople.size>1?Math.min(...uniquePeople):0;
   estimate.estimatedMinutes=durationKnown?totalMinutes:null;
   if(configs.some(x=>finite(x.allocated_people)<=0))estimate.warnings.push("Chưa cấu hình số người cho một Physical Area.");
   if(estimate.missingJobs>0)estimate.warnings.push(`${estimate.missingJobs} giá trị Masking Time đang trống.`);
   if(estimate.invalidJobs>0)estimate.warnings.push(`${estimate.invalidJobs} giá trị Masking Time không đọc được.`);
   if(jobs.length===0)estimate.warnings.push("Batch chưa có Job để tính Masking Estimate.");
   out.set(id,estimate);
  }
  return out;
 }catch{
  // V512 is advisory only. Any optional-config/schema/data failure must fail open
  // so Scheduling remains usable and only the estimate disappears.
  return out;
 }
}

export function withMaskingReady<T extends {previous_main_batches?:Array<{planned_end?:string|null;schedule_status?:string|null}>|null}>(
 row:T,estimate:BatchMaskingEstimate|undefined
):BatchMaskingEstimate|undefined{
 if(!estimate)return undefined;
 const ends=(row.previous_main_batches||[])
  .map(x=>x?.planned_end?new Date(x.planned_end):null)
  .filter((x):x is Date=>Boolean(x)&&Number.isFinite((x as Date).getTime()));
 const latest=ends.length?new Date(Math.max(...ends.map(x=>x.getTime()))):null;
 const result:BatchMaskingEstimate={...estimate};
 result.previousMainFinish=latest?latest.toISOString():null;
 result.estimatedReady=latest&&result.estimatedMinutes!=null
  ?new Date(latest.getTime()+result.estimatedMinutes*60_000).toISOString()
  :null;
 return result;
}
