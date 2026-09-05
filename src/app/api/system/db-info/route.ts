import { NextResponse } from "next/server";
import { getDbHostInfo, getPool } from "@/lib/db";
import {requireApiPermission} from "@/lib/security/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function detectProvider(host: string) {
  const value = host.toLowerCase();
  if (value.includes("aivencloud.com")) return "AIVEN";
  if (value.includes("supabase.co")) return "SUPABASE";
  if (value.includes("neon.tech")) return "NEON";
  return "POSTGRESQL";
}

export async function GET() {
 const {denied}=await requireApiPermission("config.view");if(denied)return denied;
  const startedAt = Date.now();
  try {
    const result = await getPool().query(`
      select
        current_database()::text as database,
        current_user::text as db_user,
        version()::text as postgres_version,
        inet_server_addr()::text as server_address,
        inet_server_port()::int as server_port,
        now() as checked_at
    `);

    const row = result.rows[0] ?? {};
    const hostInfo = getDbHostInfo();

    return NextResponse.json(
      {
        status: "connected",
        provider: detectProvider(hostInfo.host),
        host: hostInfo.host,
        port: hostInfo.port,
        database: row.database ?? null,
        user: row.db_user ?? null,
        serverAddress: row.server_address ?? null,
        serverPort: row.server_port ?? null,
        postgresVersion: row.postgres_version ?? null,
        checkedAt: row.checked_at ?? null,
        latencyMs: Date.now() - startedAt,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const hostInfo = getDbHostInfo();
    return NextResponse.json(
      {
        status: "error",
        provider: detectProvider(hostInfo.host),
        host: hostInfo.host || null,
        port: hostInfo.port || null,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}
