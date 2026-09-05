"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import {
  ErpDataGrid,
  ErpField,
  ErpFormGrid,
  ErpKpiCard,
  ErpPageHeader,
  ErpSection,
  ErpStatus,
  ErpTabs,
  ErpToolbar,
  type ErpGridColumn,
} from "@/components/erp/client";
import type { ErpStatusKey } from "@/lib/erp/status-config";

type DemoJob = {
  id: number;
  job: string;
  part: string;
  revision: string;
  qty: number;
  nextOperation: string;
  mainOperation: string;
  recipe: string;
  previousBatch: string;
  status: ErpStatusKey;
};

const jobs: DemoJob[] = [
  { id: 1, job: "J260901-0184", part: "65B12345-101", revision: "C", qty: 24, nextOperation: "BSAUNSLD", mainOperation: "CHEMICAL LINE", recipe: "ANODIZING BSA UNSEALED", previousBatch: "CHM_01SEP_003", status: "READY" },
  { id: 2, job: "J260901-0212", part: "65B22810-203", revision: "A", qty: 60, nextOperation: "V_M-SHPN", mainOperation: "MANUALSP", recipe: "V_M-SHPN", previousBatch: "MSP_01SEP_002", status: "READY" },
  { id: 3, job: "J260901-0227", part: "65B31007-015", revision: "B", qty: 18, nextOperation: "PRMER", mainOperation: "PRIMER", recipe: "20-T3-10 EPOXY PRIMER", previousBatch: "CHM_01SEP_005", status: "WAIT" },
  { id: 4, job: "J260901-0241", part: "65B41120-001", revision: "D", qty: 42, nextOperation: "TOPCOAT", mainOperation: "TOPCOAT1", recipe: "23-T3-10 WHITE POLYURETHANE", previousBatch: "PNT_01SEP_004", status: "HOLD" },
  { id: 5, job: "J260901-0259", part: "65B55004-009", revision: "A", qty: 120, nextOperation: "A-DBLST", mainOperation: "A-DBLST", recipe: "AUTO BLAST", previousBatch: "—", status: "SCHEDULED" },
];

const columns: ErpGridColumn<DemoJob>[] = [
  { key: "status", header: "Status", minWidth: 104, render: (row) => <ErpStatus status={row.status} /> },
  { key: "job", header: "Job", minWidth: 130, render: (row) => <span className="erpkit-grid-code erpkit-grid-link">{row.job}</span> },
  { key: "part", header: "Part", minWidth: 145, render: (row) => <span className="erpkit-grid-code">{row.part}</span> },
  { key: "rev", header: "Rev", width: 54, align: "center", render: (row) => row.revision },
  { key: "qty", header: "Qty", width: 70, align: "right", render: (row) => row.qty.toLocaleString() },
  { key: "next", header: "Next Operation", minWidth: 120, render: (row) => <b>{row.nextOperation}</b> },
  { key: "main", header: "Main Planning", minWidth: 130, render: (row) => row.mainOperation },
  { key: "recipe", header: "Recipe", minWidth: 230, render: (row) => row.recipe },
  { key: "batch", header: "Previous Batch", minWidth: 140, render: (row) => <span className="erpkit-grid-code">{row.previousBatch}</span> },
];

export function ErpKitShowcase() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ErpStatusKey>("ALL");
  const [selected, setSelected] = useState<number | null>(1);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return jobs.filter((job) => {
      const statusMatch = status === "ALL" || job.status === status;
      const queryMatch = !keyword || [job.job, job.part, job.nextOperation, job.mainOperation, job.recipe, job.previousBatch]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
      return statusMatch && queryMatch;
    });
  }, [query, status]);

  return (
    <>
      <div className="erpkit-demo-note">
        Đây là trang showcase của Template Kit. Dữ liệu bên dưới là dữ liệu mẫu, không đọc/ghi database và không thay đổi flow hiện tại.
      </div>

      <ErpPageHeader
        eyebrow="ERP Template Kit"
        title="Candidate Jobs"
        description="Mẫu giao diện chuẩn cho màn hình dữ liệu mật độ cao: page header, KPI, toolbar, grid, status và form detail."
        status={<ErpStatus label="UI DEMO" tone="neutral" />}
        actions={
          <>
            <button type="button" className="erpkit-btn">Export</button>
            <button type="button" className="erpkit-btn">Columns</button>
            <button type="button" className="erpkit-btn erpkit-btn-primary">+ Create Batch</button>
          </>
        }
      />

      <ErpTabs
        active="candidate"
        items={[
          { key: "candidate", label: "Candidate Jobs", href: "/erp-kit", count: 245 },
          { key: "batches", label: "Recent Batches", href: "/erp-kit#batches", count: 18 },
          { key: "rules", label: "Planning Rules", href: "/erp-kit#rules" },
        ]}
      />

      <div className="erpkit-kpi-grid">
        <ErpKpiCard label="Open Jobs" value="1,284" helper="All Open Job snapshot" />
        <ErpKpiCard label="READY" value="245" helper="Có thể chọn vào Batch" tone="info" />
        <ErpKpiCard label="Unscheduled" value="18" helper="Batch chờ điều độ" tone="warning" />
        <ErpKpiCard label="Scheduled Today" value="31" helper="Đã gán resource / time" tone="success" />
      </div>

      <ErpToolbar
        search={
          <div className="erpkit-search">
            <input
              className="erpkit-input"
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="Tìm Job, Part, Operation, Recipe..."
              aria-label="Tìm dữ liệu mẫu"
            />
          </div>
        }
        filters={
          <select
            className="erpkit-select"
            value={status}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as "ALL" | ErpStatusKey)}
            aria-label="Lọc trạng thái"
            style={{ width: 132 }}
          >
            <option value="ALL">All status</option>
            <option value="READY">READY</option>
            <option value="WAIT">WAIT</option>
            <option value="HOLD">HOLD</option>
            <option value="SCHEDULED">Scheduled</option>
          </select>
        }
        left={
          <>
            <span className="erpkit-filter-chip">Main: <b>All</b></span>
            <span className="erpkit-filter-chip">Priority: <b>All</b></span>
          </>
        }
        selection={<span className="erpkit-toolbar-selection">{selected ? "1 selected" : "0 selected"}</span>}
        right={
          <>
            <button type="button" className="erpkit-btn" onClick={() => { setQuery(""); setStatus("ALL"); }}>Reset</button>
            <button type="button" className="erpkit-btn">Refresh</button>
          </>
        }
      />

      <ErpDataGrid
        rows={filtered}
        columns={[
          {
            key: "pick",
            header: "",
            width: 38,
            align: "center",
            render: (row) => (
              <input
                type="radio"
                checked={selected === row.id}
                onChange={() => setSelected(row.id)}
                aria-label={`Chọn ${row.job}`}
              />
            ),
          },
          ...columns,
        ]}
        getRowKey={(row) => row.id}
        selectedRowKey={selected}
        footer={
          <>
            <span>{filtered.length} / {jobs.length} dòng mẫu</span>
            <span>1–{filtered.length} of {filtered.length}</span>
          </>
        }
      />

      <div className="erpkit-demo-split" style={{ marginTop: 12 }}>
        <ErpSection title="Form Template" description="Mẫu create/edit master data hoặc Batch properties.">
          <ErpFormGrid columns={2}>
            <ErpField label="Main Operation" required>
              <select className="erpkit-select" defaultValue="CHEMICAL LINE">
                <option>CHEMICAL LINE</option>
                <option>MANUALSP</option>
                <option>PRIMER</option>
                <option>TOPCOAT1</option>
              </select>
            </ErpField>
            <ErpField label="Recipe" required>
              <select className="erpkit-select" defaultValue="ANODIZING BSA UNSEALED">
                <option>ANODIZING BSA UNSEALED</option>
                <option>20-T3-10 EPOXY PRIMER</option>
              </select>
            </ErpField>
            <ErpField label="Batch No." hint="Để trống nếu hệ thống tự sinh mã Batch.">
              <input className="erpkit-input" placeholder="CHM_02SEP_001" />
            </ErpField>
            <ErpField label="Resource">
              <select className="erpkit-select" defaultValue="FB1">
                <option>FB1</option>
                <option>FB2</option>
                <option>FB3</option>
              </select>
            </ErpField>
          </ErpFormGrid>
          <div className="erpkit-form-actions">
            <button type="button" className="erpkit-btn">Cancel</button>
            <button type="button" className="erpkit-btn erpkit-btn-primary">Save</button>
          </div>
        </ErpSection>

        <ErpSection title="Status System" description="Một nguồn chuẩn dùng chung cho Planning / Schedule / Tracker.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ErpStatus status="READY" />
            <ErpStatus status="WAIT" />
            <ErpStatus status="HOLD" />
            <ErpStatus status="UNSCHEDULED" />
            <ErpStatus status="SCHEDULED" />
            <ErpStatus status="RUNNING" />
            <ErpStatus status="DONE" />
            <ErpStatus status="ERROR" />
          </div>
          <div className="erpkit-page-meta-row" style={{ marginTop: 14 }}>
            <span>Density:</span><b>Compact</b><span>•</span><span>Row:</span><b>36px</b><span>•</span><span>Desktop-first</span>
          </div>
        </ErpSection>
      </div>
    </>
  );
}
