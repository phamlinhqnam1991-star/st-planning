import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {syncAllStDerived} from "@/lib/st-operation-flow";
import {applyOperationFlow,validateApplyPayload,clean,type ApplyFlowPayload} from "@/lib/st-operation-flow-apply";

export const runtime="nodejs";
export const maxDuration=300;

/**
 * Thêm hàng loạt nhiều Operation Code (mỗi operation tạo ĐỦ mapping:
 * Scope → Source→Main → Main Master → Nhóm → Khu vật lý → Khu điều độ → Planner).
 * Tất cả trong 1 transaction, chỉ REBUILD chain 1 lần ở cuối (nhanh hơn nhiều
 * so với gọi POST từng con — mỗi lần POST đều rebuild).
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? (b.items as ApplyFlowPayload[]) : [];

  if (!items.length) {
    return NextResponse.json({ error: "Không có Operation nào được chọn." }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "Mỗi lần thêm tối đa 200 Operation." }, { status: 400 });
  }

  // Kiểm tra toàn bộ TRƯỚC khi ghi DB — lỗi nào báo thẳng, không đụng dữ liệu.
  const failed: { operation_code: string; error: string }[] = [];
  for (const item of items) {
    const err = validateApplyPayload(item);
    if (err) {
      failed.push({
        operation_code: clean(item.source_operation_code),
        error: err,
      });
    }
  }
  if (failed.length) {
    return NextResponse.json(
      { ok: false, applied: [], failed, message: "Có Operation chưa đủ thông tin — chưa ghi dữ liệu nào." },
      { status: 400 }
    );
  }

  const c = await getPool().connect();
  try {
    await c.query("begin");
    const applied: { operation_code: string; standard_operation: string }[] = [];
    for (const item of items) {
      const r = await applyOperationFlow(c, item);
      applied.push({ operation_code: r.source, standard_operation: r.standard || "" });
    }
    const sync = await syncAllStDerived(c);
    await c.query("commit");
    return NextResponse.json({
      ok: true,
      applied,
      failed: [],
      count: applied.length,
      message: `Đã thêm ${applied.length} Operation và dựng lại toàn bộ chuỗi công đoạn.`,
      sync,
    });
  } catch (e) {
    try {
      await c.query("rollback");
    } catch {}
    return NextResponse.json(
      { ok: false, applied: [], failed: [{ operation_code: "", error: e instanceof Error ? e.message : String(e) }], message: "Thêm hàng loạt thất bại — đã hoàn tác toàn bộ." },
      { status: 500 }
    );
  } finally {
    c.release();
  }
}
