import type {PoolClient} from "pg";

export type BatchNumberConfig={
 batchPrefix:string;
 sequenceStart:number;
 sequencePadding:number;
 batchSizeQty:number|null;
 autoSplit:boolean;
 batchSizeSource:"RECIPE"|"COMMON"|"NONE";
};

const clean=(v:unknown)=>String(v??"").trim();

export function validBatchPrefix(v:unknown){
 const x=clean(v).toUpperCase();
 // Prefix is the full literal text before the numeric sequence.
 // Examples: XXX_, PRI-, PAINT_2026_. No date token is injected by code.
 return /^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(x)?x:"";
}

function escapeRegexLiteral(v:string){
 return v.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

export async function loadBatchNumberConfig(c:PoolClient,standardOperation:string,recipeKey?:string|null):Promise<BatchNumberConfig>{
 const q=await c.query(`
  select batch_prefix,batch_sequence_start,batch_sequence_padding,batch_size_qty,batch_auto_split
  from md_operation_master
  where upper(trim(standard_operation))=upper(trim($1)) and is_active=true
  limit 1
 `,[standardOperation]);
 if(!q.rowCount)throw new Error(`Operation Master chưa có ${standardOperation}.`);
 const row=q.rows[0];
 const batchPrefix=validBatchPrefix(row.batch_prefix);
 if(!batchPrefix)throw new Error(`${standardOperation} chưa có Batch Prefix hợp lệ. Vào Cấu hình → Operation Master → Batch Config.`);
 const sequenceStart=Math.max(0,Math.trunc(Number(row.batch_sequence_start??1)));
 const sequencePadding=Math.min(12,Math.max(1,Math.trunc(Number(row.batch_sequence_padding??5))));
 const commonRaw=Number(row.batch_size_qty);
 const commonSize=Number.isFinite(commonRaw)&&commonRaw>0?commonRaw:null;

 let recipeSize:number|null=null;
 if(clean(recipeKey)){
  const rq=await c.query(`
   select batch_size_qty
   from md_operation_recipe_batch_size
   where upper(trim(standard_operation))=upper(trim($1))
     and recipe_key=$2
     and is_active=true
   limit 1
  `,[standardOperation,clean(recipeKey)]);
  const raw=Number(rq.rows[0]?.batch_size_qty);
  recipeSize=Number.isFinite(raw)&&raw>0?raw:null;
 }

 const batchSizeQty=recipeSize??commonSize;
 const batchSizeSource:BatchNumberConfig["batchSizeSource"]=recipeSize!=null?"RECIPE":commonSize!=null?"COMMON":"NONE";
 return {batchPrefix,sequenceStart,sequencePadding,batchSizeQty,autoSplit:Boolean(row.batch_auto_split),batchSizeSource};
}

export async function allocateBatchNumbers(c:PoolClient,config:BatchNumberConfig,count:number){
 if(count<1)return [] as string[];
 const {batchPrefix,sequenceStart,sequencePadding}=config;
 await c.query(`select pg_advisory_xact_lock(hashtext($1))`,[`BATCHSEQ|${batchPrefix}`]);
 const regex=`^${escapeRegexLiteral(batchPrefix)}([0-9]+)$`;
 const q=await c.query(`
  select coalesce(max((regexp_match(batch_no,$1))[1]::bigint),$2::bigint-1)+1 next_no
  from planning_batch
  where batch_no ~ $1
 `,[regex,sequenceStart]);
 const next=Math.max(sequenceStart,Number(q.rows[0]?.next_no??sequenceStart));
 const max=10**Math.min(sequencePadding,12)-1;
 if(next+count-1>max)throw new Error(`Batch sequence của Prefix ${batchPrefix} vượt quá ${sequencePadding} chữ số.`);
 return Array.from({length:count},(_,i)=>`${batchPrefix}${String(next+i).padStart(sequencePadding,"0")}`);
}
