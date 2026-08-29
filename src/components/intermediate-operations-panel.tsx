import type {IntermediateOperation} from "@/lib/planning/intermediate-operations";

/**
 * Panel: các công đoạn TRUNG GIAN đang có Job — công đoạn chính kế tiếp để lập kế hoạch.
 */
export function IntermediateOperationsPanel({ rows }: { rows: IntermediateOperation[] }) {
  if (!rows.length) return null;
  const totalJobs = rows.reduce((a, r) => a + Number(r.so_job || 0), 0);
  const unanchored = rows.reduce((a, r) => a + Number(r.chua_neo || 0), 0);

  return (
    <div className="erp-table-panel section intermediate-ops-panel" id="intermediate-ops">
      <div className="erp-panel-head">
        <div>
          <b>🔧 Các công đoạn trung gian đang có Job</b>
          <small className="planning-sub">
            Công đoạn không phải công đoạn chính (che chắn, gỡ che, kiểm tra, chuẩn bị…) — Job đang ở đây sẽ
            <b> neo vào công đoạn chính KẾ TIẾP</b> để lập kế hoạch.
          </small>
        </div>
        <div className="row">
          <span className="visible-chip"><b>{rows.length}</b> công đoạn</span>
          <span className="visible-chip"><b>{totalJobs.toLocaleString("vi-VN")}</b> Job</span>
          {unanchored > 0 && <span className="visible-chip warn"><b>{unanchored}</b> Job chưa neo</span>}
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 360 }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Công đoạn trung gian</th>
              <th className="num">Số Job</th>
              <th>Neo vào công đoạn chính</th>
              <th className="num">Chưa neo</th>
              <th>Lý do là trung gian</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cong_doan}>
                <td><b>{r.cong_doan}</b></td>
                <td className="num">{Number(r.so_job || 0).toLocaleString("vi-VN")}</td>
                <td>
                  {r.next_main ? (
                    <span className="missing-op-tag">{r.next_main}</span>
                  ) : (
                    <span className="missing-op-tag idle">Chưa xác định</span>
                  )}
                </td>
                <td className="num">{Number(r.chua_neo || 0)}</td>
                <td style={{ fontSize: 12, color: "#475569" }}>
                  {String(r.ly_do || "").replace(/^\d+\.\s*/, "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="muted" style={{ display: "block", marginTop: 8 }}>
        💡 "Chưa neo" nghĩa là Job chưa có dòng sẵn sàng — bấm <b>Rebuild Chain</b> trên trang này để neo lại.
        Muốn 1 công đoạn trở thành công đoạn chính → thêm mapping cho nó (panel "➕ Operations chưa hiện" hoặc Cấu hình → Trợ lý Operation).
      </small>
    </div>
  );
}
