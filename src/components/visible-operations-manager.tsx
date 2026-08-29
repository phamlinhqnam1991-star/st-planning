"use client";

import {useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import type {VisibleOperation} from "@/lib/planning/visible-operations";

type Area = { id: number; area_name: string };
type ScheduleArea = { schedule_area_code: string; schedule_area_name: string; planner_owner?: string | null };

const STATUS_LABEL: Record<string, string> = {
  OK: "Đủ cấu hình",
  MISSING_MAIN_MAPPING: "Thiếu Source→Main",
  MISSING_MAIN_MASTER: "Thiếu Main Master",
  MISSING_ST_GROUP: "Thiếu ST Group",
  MISSING_AREA: "Thiếu Khu vật lý",
  MISSING_SCHEDULE_AREA: "Thiếu Khu điều độ",
  MISSING_PLANNER_OWNER: "Thiếu Planner",
};

const RULES = ["DIRECT", "OCCURRENCE", "SEQUENCE", "SEQUENCE/FALLBACK"];

type EditForm = {
  standard_operation: string;
  mapping_rule: string;
  st_group: string;
  area_id: string;
  schedule_area_code: string;
  planner_owner: string;
};

/** Các công đoạn (Operation Code) được phép hiển thị trên Planning Board — luôn hiện + sửa trực tiếp. */
export function VisibleOperationsManager({
  rows, mainOperations, groups, areas, scheduleAreas,
}: {
  rows: VisibleOperation[];
  mainOperations: string[];
  groups: string[];
  areas: Area[];
  scheduleAreas: ScheduleArea[];
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    standard_operation: "", mapping_rule: "DIRECT", st_group: "",
    area_id: "", schedule_area_code: "", planner_owner: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  usePopupMessage(message);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    if (!query) return rows;
    return rows.filter((r) =>
      [
        r.operation_code, r.operation_name, r.standard_operation,
        r.st_group, r.area_name, r.schedule_area_name, r.planner_owner,
      ].some((v) => String(v ?? "").toUpperCase().includes(query))
    );
  }, [rows, q]);

  const ok = rows.filter((r) => r.config_status === "OK").length;
  const missing = rows.length - ok;
  const totalJobs = rows.reduce((a, r) => a + Number(r.jobs_on_board || 0), 0);

  const startEdit = (r: VisibleOperation) => {
    setEditing(r.operation_code);
    setForm({
      standard_operation: r.standard_operation || r.operation_code,
      mapping_rule: r.mapping_rule || "DIRECT",
      st_group: r.st_group || "",
      area_id: r.area_id == null ? "" : String(r.area_id),
      schedule_area_code: r.schedule_area_code || "",
      planner_owner: r.planner_owner && ["1", "2"].includes(r.planner_owner) ? r.planner_owner : "",
    });
  };

  const pickScheduleArea = (code: string) => {
    setForm((f) => {
      const sa = scheduleAreas.find((x) => x.schedule_area_code === code);
      return {
        ...f,
        schedule_area_code: code,
        planner_owner: sa?.planner_owner && ["1", "2"].includes(sa.planner_owner) ? sa.planner_owner : f.planner_owner,
      };
    });
  };

  const save = async (code: string) => {
    if (!form.standard_operation.trim()) {
      setMessage("Công đoạn chính không được để trống.");
      return;
    }
    if (!form.st_group || !form.area_id || !form.schedule_area_code || !["1", "2"].includes(form.planner_owner)) {
      setMessage("Cần đủ Nhóm ST, Khu vật lý, Khu điều độ và Planner.");
      return;
    }
    const okConfirm = window.confirm(
      `Lưu cấu hình cho ${code}?\n\n` +
        `Hệ thống sẽ cập nhật mapping và dựng lại toàn bộ chuỗi công đoạn (có thể mất vài chục giây).\n\nTiếp tục?`
    );
    if (!okConfirm) return;

    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/config/st-operation-flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_operation_code: code,
          operation_type: "PLANNING_OPERATION",
          standard_operation: form.standard_operation.trim().toUpperCase(),
          mapping_rule: form.mapping_rule,
          st_group: form.st_group,
          area_id: Number(form.area_id),
          schedule_area_code: form.schedule_area_code,
          planner_owner: form.planner_owner,
          batch_prefix: null,
          source_planning_order: null,
          main_planning_order: null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không lưu được.");
      setMessage(`Đã lưu ${code} → ${d.standard_operation || ""} và dựng lại chuỗi.`);
      setEditing(null);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setMessage(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (code: string, name: string) => {
    const okConfirm = window.confirm(
      `Bỏ ${code} khỏi ST Scope?\n\n` +
        `• Job của công đoạn này sẽ KHÔNG hiện trên Planning Board nữa (ngay lập tức).\n` +
        `• Mapping ST của code này sẽ ngưng hoạt động; Source Operation vẫn giữ trong catalog.\n` +
        `• Lịch sử Batch/Schedule không bị xóa.\n` +
        `• Thao tác NHANH — không dựng lại toàn bộ chuỗi; nên bấm Rebuild Chain trên Planning Board để làm sạch khi thuận tiện.\n\n` +
        `Tiếp tục?`
    );
    if (!okConfirm) return;

    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/config/st-operation-flow", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_operation_code: code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không bỏ được.");
      setMessage(`Đã bỏ ${code} khỏi ST Scope (${name || ""}) và dựng lại chuỗi.`);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setMessage(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erp-table-panel section visible-ops-panel" id="visible-ops">
      <div className="erp-panel-head">
        <div>
          <b>✅ Các công đoạn được hiển thị trên Planning Board</b>
          <small className="planning-sub">
            Thuộc ST Scope loại Planning Operation — bấm <b>Sửa</b> để chỉnh cấu hình ngay tại đây
            (công đoạn chính, nhóm, khu vực, lane, planner); lưu xong hệ thống tự dựng lại chuỗi.
          </small>
        </div>
        <div className="row">
          <span className="visible-chip ok"><b>{ok}</b> đủ cấu hình</span>
          <span className="visible-chip warn"><b>{missing}</b> thiếu</span>
          <span className="visible-chip"><b>{totalJobs.toLocaleString("vi-VN")}</b> Job đang hiện</span>
          <input className="input" style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm công đoạn..." />
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 460 }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th>Operation Code</th>
              <th>Công đoạn chính</th>
              <th>Nhóm ST</th>
              <th>Khu vật lý</th>
              <th>Khu điều độ</th>
              <th>Planner</th>
              <th className="num">Job</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const okStatus = r.config_status === "OK";
              const isEditing = editing === r.operation_code;
              return (
                <tr key={r.operation_code} style={okStatus ? undefined : { background: "#fff7ed" }}>
                  <td>
                    <b>{r.operation_code}</b>
                    {r.operation_name ? <small className="planning-sub">{r.operation_name}</small> : null}
                  </td>
                  {isEditing ? (
                    <>
                      <td>
                        <input className="input" list="vis-ops-main" value={form.standard_operation}
                          onChange={(e) => setForm({ ...form, standard_operation: e.target.value.toUpperCase() })} />
                        <datalist id="vis-ops-main">{mainOperations.map((m) => <option key={m} value={m} />)}</datalist>
                        <select className="input" style={{ marginTop: 4 }} value={form.mapping_rule}
                          onChange={(e) => setForm({ ...form, mapping_rule: e.target.value })}>
                          {RULES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="input" value={form.st_group}
                          onChange={(e) => setForm({ ...form, st_group: e.target.value })}>
                          <option value="">Chọn nhóm...</option>
                          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="input" value={form.area_id}
                          onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
                          <option value="">Chọn khu...</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.area_name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="input" value={form.schedule_area_code}
                          onChange={(e) => pickScheduleArea(e.target.value)}>
                          <option value="">Chọn lane...</option>
                          {scheduleAreas.map((s) => <option key={s.schedule_area_code} value={s.schedule_area_code}>{s.schedule_area_name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="input" value={form.planner_owner}
                          onChange={(e) => setForm({ ...form, planner_owner: e.target.value })}>
                          <option value="">Chọn...</option>
                          <option value="1">Planner 1</option>
                          <option value="2">Planner 2</option>
                        </select>
                      </td>
                      <td className="num">{Number(r.jobs_on_board || 0).toLocaleString("vi-VN")}</td>
                      <td><span className={`visible-status ${okStatus ? "ok" : "warn"}`}>{STATUS_LABEL[r.config_status] || r.config_status}</span></td>
                      <td className="action">
                        <div className="row">
                          <button className="btn small primary" disabled={busy} onClick={() => save(r.operation_code)}>
                            {busy ? "Đang lưu..." : "Lưu"}
                          </button>
                          <button className="btn small" disabled={busy} onClick={() => setEditing(null)}>Hủy</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><b>{r.standard_operation || "—"}</b></td>
                      <td>{r.st_group || "—"}</td>
                      <td>{r.area_name || "—"}</td>
                      <td>{r.schedule_area_name || "—"}</td>
                      <td>{r.planner_owner ? `Planner ${r.planner_owner}` : "—"}</td>
                      <td className="num">{Number(r.jobs_on_board || 0).toLocaleString("vi-VN")}</td>
                      <td><span className={`visible-status ${okStatus ? "ok" : "warn"}`}>{STATUS_LABEL[r.config_status] || r.config_status}</span></td>
                      <td className="action">
                        <div className="row">
                          <button className="btn small" onClick={() => startEdit(r)}>✏️ Sửa</button>
                          <button className="btn small danger-btn" disabled={busy} onClick={() => remove(r.operation_code, r.operation_name || "")}>🗑 Xóa</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={9} className="muted">Không có công đoạn nào khớp tìm kiếm.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <small className="muted" style={{ display: "block", marginTop: 8 }}>
        💡 Sửa tại đây áp dụng ngay: cập nhật Source→Main Mapping, Main Master, Nhóm ST, Khu vật lý, Khu điều độ, Planner rồi dựng lại toàn bộ chuỗi công đoạn.
      </small>
    </div>
  );
}
