import { getPool } from "@/lib/db";
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
  "md_st_group",
  "md_process_recipe",
  "md_operation_recipe_mapping",
] as const;

export async function getStats(){
  const out:Record<string,number>={};
  const issues:string[]=[];
  const c=await getPool().connect();

  try{
    for(const table of tables){
      try{
        const q=await c.query(`select count(*)::int count from ${table} where is_active=true`);
        out[table]=Number(q.rows[0]?.count||0);
      }catch(error){
        out[table]=0;
        issues.push(`${table}: ${errorMessage(error)}`);
      }
    }

    let imports:any[]=[];
    try{
      const q=await c.query(`
        select id,file_name,status,source_rows,new_rows,changed_rows,unchanged_rows,
               routing_rows,created_at,finished_at,error_message
        from master_import_batch
        order by created_at desc
        limit 10
      `);
      imports=q.rows;
    }catch(error){
      issues.push(`master_import_batch: ${errorMessage(error)}`);
    }

    return {counts:out,imports,issues};
  }finally{
    c.release();
  }
}
