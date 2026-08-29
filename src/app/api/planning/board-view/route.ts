import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";

/**
 * Default View của Planning Board — lưu trên MÁY CHỦ để dùng chung mọi môi trường
 * (localhost, Vercel, mọi trình duyệt).
 * GET  → { views: { [view_key]: payload } }
 * POST { action:"save", view_key, payload } | { action:"delete", view_key }
 */
export async function GET() {
  const c = await getPool().connect();
  try {
    const q = await c.query(`select view_key,payload from planning_board_view`);
    const views: Record<string, unknown> = {};
    for (const r of q.rows) views[String(r.view_key)] = r.payload;
    return NextResponse.json({ views });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    c.release();
  }
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");
  const viewKey = String(b.view_key || "").trim();
  if (!viewKey) {
    return NextResponse.json({ error: "Thiếu view_key." }, { status: 400 });
  }

  const c = await getPool().connect();
  try {
    if (action === "save") {
      const payload = b.payload;
      if (!payload || typeof payload !== "object") {
        return NextResponse.json({ error: "Thiếu payload." }, { status: 400 });
      }
      await c.query(
        `insert into planning_board_view(view_key,payload,updated_by,updated_at)
         values($1,$2::jsonb,'planning-board',now())
         on conflict(view_key) do update set payload=excluded.payload,updated_by=excluded.updated_by,updated_at=now()`,
        [viewKey, JSON.stringify(payload)]
      );
      return NextResponse.json({ ok: true, view_key: viewKey });
    }
    if (action === "delete") {
      await c.query(`delete from planning_board_view where view_key=$1`, [viewKey]);
      return NextResponse.json({ ok: true, view_key: viewKey });
    }
    return NextResponse.json({ error: "action phải là save hoặc delete." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    c.release();
  }
}
