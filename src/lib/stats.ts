import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/error-message";

const tables=[
  "md_part",
  "md_part_revision",
  "md_operation_master",
  "md_st_operation_mapping",
  "md_operation",
  "md_routing_detailed",
  "md_material_finish",
  "md_process_requirement",
  "md_st_routing_summary",
  "md_st_routing",
  "md_part_routing",
  "md_area",
  "md_st_group"
] as const;

export async function getStats(){
  const s=createAdminClient();
  const out:Record<string,number>={};
  const issues:string[]=[];

  for(const table of tables){
    const {count,error}=await s
      .from(table)
      .select("*",{count:"exact",head:true})
      .eq("is_active",true);

    if(error){
      out[table]=0;
      issues.push(`${table}: ${errorMessage(error)}`);
      continue;
    }
    out[table]=count||0;
  }

  const {data:imports,error:importError}=await s
    .from("master_import_batch")
    .select("id,file_name,status,source_rows,new_rows,changed_rows,unchanged_rows,routing_rows,created_at,finished_at,error_message")
    .order("created_at",{ascending:false})
    .limit(10);

  if(importError){
    issues.push(`master_import_batch: ${errorMessage(importError)}`);
  }

  return {counts:out,imports:imports||[],issues};
}
