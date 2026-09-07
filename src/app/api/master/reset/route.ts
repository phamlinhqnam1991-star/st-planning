import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { invalidateConfigHealth } from "@/lib/config/config-health";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedRoutingConfig } from "@/lib/import/master-import";
import { IMPORT_STORAGE_BUCKET } from "@/lib/storage/import-storage";
import {requireApiPermission} from "@/lib/security/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
 const {denied}=await requireApiPermission("master.edit");if(denied)return denied;
  try {
    const c = await getPool().connect();
    try {
      await c.query("begin");
      await c.query(`truncate table md_part_process_recipe,md_part_routing,md_st_routing,md_st_routing_summary,md_routing_detailed,md_process_requirement,md_material_finish,md_operation,md_part_revision,md_part,md_source_snapshot,master_import_batch restart identity cascade`);
      await seedRoutingConfig(c);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }

    try {
      const admin = createAdminClient();
      const { data } = await admin.storage.from(IMPORT_STORAGE_BUCKET).list("", { limit: 1000 });
      if (data?.length) {
        await admin.storage.from(IMPORT_STORAGE_BUCKET).remove(data.map((x: { name: string }) => x.name));
      }
    } catch {
      // Storage cleanup is best-effort; master reset must not fail if bucket is absent.
    }

    invalidateConfigHealth();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
