"use client";

import {useMemo,useState} from "react";
import {usePopupMessage} from "@/hooks/use-popup-message";
import {OPERATION_GROUP_LABEL,type MissingOperation} from "@/lib/planning/missing-config-jobs";

type Area = { id: number; area_name: string };
type ScheduleArea = { schedule_area_code: string; schedule_area_name: string; planner_owner?: string | null };

export function MissingOperationsManager({
  operations, mainOperations, groups, areas, scheduleAreas,
}: {
  operations: MissingOperation[];
  mainOperations: string[];
  groups: string[];
  areas: Area[];
  scheduleAreas: ScheduleArea[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupChoice, setGroupChoice] = useState("__auto__");
  const [areaId, setAreaId] = useState("");
  const [scheduleArea, setScheduleArea] = useState("");
  const [planner, setPlanner] = useState("");
  const [overrideMain, setOverrideMain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  usePopupMessage(message);

  const addable = useMemo(
    () => operations.filter((o) => o.nhom === "1" || o.nhom === "2" || o.nhom === "3"),
    [operations]
  );

  const allChecked = addable.length > 0 && addable.every((o) => selected.has(o.operation_code));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) addable.forEach((o) => next.delete(o.operation_code));
      else addable.forEach((o) => next.add(o.operation_code));
      return next;
    });
  };

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const pickScheduleArea = (code: string) => {
    setScheduleArea(code);
    const sa = scheduleAreas.find((x) => x.schedule_area_code === code);
    if (sa?.planner_owner && ["1", "2"].includes(sa.planner_owner)) setPlanner(sa.planner_owner);
  };

  const addSelected = async () => {
    const ops = addable.filter((o) => selected.has(o.operation_code));
    if (!ops.length) {
      setMessage("Chưa chọn Operation nào.");
      return;
    }
    if (!areaId || !scheduleArea || !planner) {
      setMessage("Chọn đủ Khu vật lý, Khu điều độ và Planner cho lần thêm này.");
      return;
    }

    const manualMain = overrideMain.trim().toUpperCase();
    const items = ops.map((o) => {
      const stGroup =
        groupChoice === "__auto__" ? o.suggested_st_group || "" : groupChoice;
      return {
        source_operation_code: o.operation_code,
        operation_type: "PLANNING_OPERATION" as const,
        standard_operation: manualMain || o.suggested_main,
        st_group: stGroup,
        area_id: Number(areaId),
        schedule_area_code: scheduleArea,
        planner_owner: planner,
        mapping_rule: o.suggested_rule || "DIRECT",
      };
    });

    const ok = window.confirm(
      `Thêm ${ops.length} Operation vào ST (loại Planning Operation)?\n\n` +
        `Mỗi Operation sẽ được tạo ĐỦ mapping: ST Scope → Source→Main → Công đoạn chính → Nhóm ST → Khu vật lý → Khu điều độ → Planner.\n\n` +
        `Sau khi thêm, hệ thống dựng lại toàn bộ chuỗi công đoạn (có thể mất vài chục giây). Tiếp tục?`
    );
    if (!ok) return;

    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/config/st-operation-flow/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const d = await r.json();
      if (!r.ok) {
        const errs = (d.failed || []).map((f: any) => `${f.operation_code || ""}: ${f.error}`).join("; ");
        throw new Error(d.message || errs || d.error || "Thêm thất bại.");
      }
      setMessage(d.message || `Đã thêm ${d.count || ops.length} Operation.`);
      setSelected(new Set());
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      setMessage(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!operations.length) return null;

  const groupLabel = (nhom: string) => OPERATION_GROUP_LABEL[nhom] || nhom;
  const addableCount = addable.length;

  return (
    <div className="erp-table-panel section missing-ops-panel" id="missing-ops">
      <div className="erp-panel-head">
        <div>
          <b>➕ Operations chưa hiện trên Planning Board</b>
          <small className="planning-sub">
            Gom theo NextOperation của {operations.reduce((a, o) => a + o.so_job, 0)} Job mất tích.
            Tích chọn → điền cấu hình mặc định → Thêm: hệ thống tự tạo ĐỦ mapping liên quan.
          </small>
        </div>
        <span>{operations.length} Operation</span>
      </div>

      {/* Cấu hình mặc định cho lần thêm */}
      <div className="missing-ops-defaults">
        <label>Nhóm ST
          <select className="input" value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
            <option value="__auto__">Tự động theo gợi ý từng Operation</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>Khu vật lý
          <select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Chọn khu...</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.area_name}</option>)}
          </select>
        </label>
        <label>Khu điều độ (lane)
          <select className="input" value={scheduleArea} onChange={(e) => pickScheduleArea(e.target.value)}>
            <option value="">Chọn lane...</option>
            {scheduleAreas.map((s) => <option key={s.schedule_area_code} value={s.schedule_area_code}>{s.schedule_area_name}</option>)}
          </select>
        </label>
        <label>Planner phụ trách
          <select className="input" value={planner} onChange={(e) => setPlanner(e.target.value)}>
            <option value="">Chọn...</option>
            <option value="1">Planner 1</option>
            <option value="2">Planner 2</option>
          </select>
        </label>
        <label title="Điền sẽ ghi đè Công đoạn chính cho MỌI Operation được chọn (có thể để trống = dùng gợi ý)">
          Công đoạn chính (ghi đè, tùy chọn)
          <input className="input" list="missing-ops-main" value={overrideMain} onChange={(e) => setOverrideMain(e.target.value)} placeholder="Để trống = dùng gợi ý" />
          <datalist id="missing-ops-main">
            {mainOperations.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn primary" type="button" disabled={busy || selected.size === 0} onClick={addSelected}>
          {busy ? "Đang thêm + dựng lại chuỗi..." : `＋ Thêm ${selected.size} Operation đã chọn`}
        </button>
        <span className="muted" style={{ fontSize: 11 }}>
          Chỉ các nhóm ① ② ③ mới thêm được (④ cần bấm Rebuild Chain, ⑤ là đang chờ — không phải lỗi).
        </span>
      </div>

      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="erp-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={addable.length === 0} title="Chọn tất cả Operation có thể thêm" />
              </th>
              <th>Operation Code</th>
              <th className="num">Số Job</th>
              <th>Lý do</th>
              <th>Gợi ý Công đoạn chính</th>
              <th>Gợi ý Nhóm ST</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((o) => {
              const addableOp = o.nhom === "1" || o.nhom === "2" || o.nhom === "3";
              return (
                <tr key={o.operation_code} className={addableOp ? "" : "missing-ops-row-idle"}>
                  <td>
                    {addableOp ? (
                      <input type="checkbox" checked={selected.has(o.operation_code)} onChange={() => toggle(o.operation_code)} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td><b>{o.operation_code}</b></td>
                  <td className="num">{o.so_job}</td>
                  <td>
                    <span className={`missing-op-tag ${o.nhom === "4" ? "warn" : o.nhom === "5" ? "idle" : ""}`}>
                      {groupLabel(o.nhom)}
                    </span>
                  </td>
                  <td>{o.suggested_main || "—"}</td>
                  <td>{o.suggested_st_group || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
