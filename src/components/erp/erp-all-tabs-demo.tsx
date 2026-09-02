"use client";

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ErpDataGrid,
  ErpField,
  ErpFormGrid,
  ErpKpiCard,
  ErpPlanningMatrix,
  ErpPageHeader,
  ErpSection,
  ErpStatus,
  ErpToolbar,
  type ErpGridColumn,
  type ErpPlanningMatrixCell,
  type ErpPlanningMatrixOperation,
  type ErpPlanningMatrixRow,
  type ErpPlanningMatrixSelection,
} from "@/components/erp";
import type { ErpStatusKey } from "@/lib/erp/status-config";

type MainTab =
  | "master"
  | "config"
  | "part"
  | "job"
  | "jobs"
  | "planning"
  | "masking"
  | "schedule"
  | "import"
  | "guide";

const MAIN_TABS: { key: MainTab; label: string; short: string }[] = [
  { key: "master", label: "Master Data", short: "MD" },
  { key: "config", label: "Cấu hình", short: "CF" },
  { key: "part", label: "Part Tracker", short: "PT" },
  { key: "job", label: "Job Tracker", short: "JT" },
  { key: "jobs", label: "All Open Jobs", short: "OJ" },
  { key: "planning", label: "Planning Board", short: "PL" },
  { key: "masking", label: "Masking / Unmasking", short: "MU" },
  { key: "schedule", label: "Board Điều Độ", short: "SC" },
  { key: "import", label: "Import Master", short: "IM" },
  { key: "guide", label: "Logic & Hướng dẫn", short: "LG" },
];

const MASTER_TABS = [
  ["part", "Part"],
  ["revision", "Part Revision"],
  ["sourceoperation", "Source Operation"],
  ["routing", "Routing Detail"],
  ["finish", "Material Finish"],
  ["requirement", "Process Requirement"],
  ["strouting", "ST Routing Master"],
  ["stroutingchain", "ST Routing Chain"],
  ["partrouting", "Part → Routing"],
] as const;

const CONFIG_TABS = [
  ["overview", "Tổng quan Cấu hình", "—"],
  ["flow", "Trợ lý Operation", "01"],
  ["scope", "ST Scope", "02"],
  ["mapping", "Source → Main Mapping", "03"],
  ["operation", "Main Operation", "04"],
  ["group", "ST Group", "05"],
  ["area", "Khu vực vật lý", "06"],
  ["schedulearea", "Khu vực điều độ", "07"],
  ["planner", "Phân chia Planner", "08"],
  ["recipe", "Công thức & Rule", "09"],
  ["loading", "Loading / Unloading", "10"],
  ["process", "Thời gian Process", "11"],
  ["columns", "Cột All Open Job", "12"],
] as const;

type OpenJob = {
  id: number;
  status: ErpStatusKey;
  job: string;
  part: string;
  rev: string;
  qty: number;
  surface: number;
  nextOperation: string;
  main: string;
  recipe: string;
  previousBatch: string;
  priority: string;
};

const OPEN_JOBS: OpenJob[] = [
  { id: 1, status: "READY", job: "J260902-0184", part: "65B12345-101", rev: "C", qty: 24, surface: 2180, nextOperation: "BSAUNSLD", main: "CHEMICAL LINE", recipe: "ANODIZING BSA UNSEALED", previousBatch: "CHM_01SEP_003", priority: "cat3" },
  { id: 2, status: "READY", job: "J260902-0212", part: "65B22810-203", rev: "A", qty: 60, surface: 1560, nextOperation: "V_M-SHPN", main: "MANUALSP", recipe: "V_M-SHPN", previousBatch: "MSP_01SEP_002", priority: "sales" },
  { id: 3, status: "WAIT", job: "J260902-0227", part: "65B31007-015", rev: "B", qty: 18, surface: 720, nextOperation: "PRMER", main: "PRIMER", recipe: "20-T3-10 EPOXY PRIMER", previousBatch: "CHM_01SEP_005", priority: "normal" },
  { id: 4, status: "HOLD", job: "J260902-0241", part: "65B41120-001", rev: "D", qty: 42, surface: 3840, nextOperation: "TOPCOAT", main: "TOPCOAT1", recipe: "23-T3-10 WHITE POLYURETHANE", previousBatch: "PNT_01SEP_004", priority: "cat5" },
  { id: 5, status: "SCHEDULED", job: "J260902-0259", part: "65B55004-009", rev: "A", qty: 120, surface: 5310, nextOperation: "A-DBLST", main: "A-DBLST", recipe: "AUTO BLAST", previousBatch: "—", priority: "normal" },
  { id: 6, status: "READY", job: "J260902-0280", part: "65B60012-021", rev: "B", qty: 80, surface: 4120, nextOperation: "TSAUNSL", main: "CHEMICAL LINE", recipe: "ANODIZING TSA UNSEALED", previousBatch: "CHM_01SEP_006", priority: "current month" },
];

const JOB_COLUMNS: ErpGridColumn<OpenJob>[] = [
  { key: "status", header: "Status", minWidth: 104, render: (r) => <ErpStatus status={r.status} /> },
  { key: "job", header: "Job", minWidth: 126, render: (r) => <span className="erpkit-grid-code erpkit-grid-link">{r.job}</span> },
  { key: "part", header: "Part", minWidth: 142, render: (r) => <span className="erpkit-grid-code">{r.part}</span> },
  { key: "rev", header: "Rev", width: 52, align: "center", render: (r) => r.rev },
  { key: "qty", header: "Qty", width: 68, align: "right", render: (r) => r.qty },
  { key: "surface", header: "dm²", width: 80, align: "right", render: (r) => r.surface.toLocaleString() },
  { key: "next", header: "NextOperation", minWidth: 118, render: (r) => <b>{r.nextOperation}</b> },
  { key: "main", header: "Main Planning", minWidth: 132, render: (r) => r.main },
  { key: "recipe", header: "Recipe", minWidth: 220, render: (r) => r.recipe },
  { key: "prev", header: "Previous Batch", minWidth: 138, render: (r) => <span className="erpkit-grid-code">{r.previousBatch}</span> },
  { key: "priority", header: "Priority", minWidth: 102, render: (r) => <span className="erpkit-priority">{r.priority}</span> },
];

const BATCHES = [
  { id: 1, batch: "CHM_02SEP_001", operation: "CHEMICAL LINE", recipe: "ANODIZING BSA UNSEALED", jobs: 5, qty: 164, surface: "7,820", status: "UNSCHEDULED" as ErpStatusKey },
  { id: 2, batch: "MSP_02SEP_001", operation: "MANUALSP", recipe: "V_M-SHPN", jobs: 3, qty: 92, surface: "2,460", status: "SCHEDULED" as ErpStatusKey },
  { id: 3, batch: "PNT_02SEP_002", operation: "PRIMER", recipe: "20-T3-10 EPOXY PRIMER", jobs: 4, qty: 118, surface: "6,080", status: "SCHEDULED" as ErpStatusKey },
];

const MASTER_ROWS = [
  { code: "65B12345-101", name: "BRACKET ASSY", rev: "C", program: "A320", surface: "90.8", active: "ACTIVE" },
  { code: "65B22810-203", name: "HINGE FITTING", rev: "A", program: "A350", surface: "26.0", active: "ACTIVE" },
  { code: "65B31007-015", name: "SUPPORT", rev: "B", program: "A320", surface: "40.0", active: "ACTIVE" },
  { code: "65B41120-001", name: "FRAME DETAIL", rev: "D", program: "A330", surface: "91.4", active: "ACTIVE" },
];

const CONFIG_GENERIC_ROWS = [
  { code: "BSAUNSLD", main: "CHEMICAL LINE", group: "CHEMICAL", area: "Chemical line", status: "Configured" },
  { code: "V_M-SHPN", main: "MANUALSP", group: "SHOT PEENING", area: "Manual Shot peening", status: "Configured" },
  { code: "PRMER", main: "PRIMER", group: "PAINT", area: "Painting", status: "Configured" },
  { code: "TOPCOAT", main: "TOPCOAT1", group: "PAINT", area: "Painting", status: "Configured" },
];

function DemoModuleTabs({ active, onChange }: { active: MainTab; onChange: (key: MainTab) => void }) {
  return (
    <div className="erpkit-demo-module-tabs" role="tablist" aria-label="Demo tất cả module">
      {MAIN_TABS.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          key={tab.key}
          className={`erpkit-demo-module-tab ${active === tab.key ? "is-active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          <span>{tab.short}</span>
          <b>{tab.label}</b>
        </button>
      ))}
    </div>
  );
}

function DemoSidebar({ title, items, active, onChange }: { title: string; items: readonly (readonly [string, string, string?])[]; active: string; onChange: (key: string) => void }) {
  return (
    <aside className="erpkit-demo-inner-sidebar">
      <div className="erpkit-sidebar-title">{title}</div>
      <nav>
        {items.map(([key, label, no]) => (
          <button type="button" key={key} className={active === key ? "is-active" : ""} onClick={() => onChange(key)}>
            {no ? <span className="erpkit-demo-step-no">{no}</span> : null}
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function MockSearch({ placeholder }: { placeholder: string }) {
  return <div className="erpkit-search"><input className="erpkit-input" placeholder={placeholder} /></div>;
}

function MasterDataDemo() {
  const [sub, setSub] = useState<string>("part");
  const label = MASTER_TABS.find(([key]) => key === sub)?.[1] ?? "Part";
  const rows = sub === "part" ? MASTER_ROWS : MASTER_ROWS.map((r, i) => ({ ...r, code: sub === "routing" || sub === "stroutingchain" ? `RT-${String(i + 1).padStart(3, "0")}` : r.code }));
  return (
    <div className="erpkit-demo-workspace">
      <DemoSidebar title="MASTER DATA" items={MASTER_TABS} active={sub} onChange={setSub} />
      <div className="erpkit-demo-screen">
        <ErpPageHeader eyebrow="Master Data" title={label} description="Dữ liệu nền chuẩn hóa dùng xuyên suốt ST Planning." actions={<><button className="erpkit-btn">Export</button><button className="erpkit-btn erpkit-btn-primary">+ Add record</button></>} />
        <div className="erpkit-kpi-grid">
          <ErpKpiCard label="Records" value="12,486" helper="Active master records" />
          <ErpKpiCard label="Changed today" value="36" helper="Từ lần import gần nhất" tone="info" />
          <ErpKpiCard label="Inactive" value="84" helper="Không xóa dữ liệu lịch sử" tone="warning" />
          <ErpKpiCard label="Data quality" value="99.7%" helper="Không có lỗi bắt buộc" tone="success" />
        </div>
        <ErpToolbar search={<MockSearch placeholder={`Tìm trong ${label}...`} />} filters={<select className="erpkit-select erpkit-demo-select"><option>Active records</option><option>All records</option></select>} right={<><button className="erpkit-btn">Columns</button><button className="erpkit-btn">Refresh</button></>} />
        <ErpDataGrid rows={rows} getRowKey={(r) => r.code} columns={[
          { key: "code", header: sub === "part" ? "Part" : "Code", minWidth: 150, render: (r) => <span className="erpkit-grid-code erpkit-grid-link">{r.code}</span> },
          { key: "name", header: "Description", minWidth: 220, render: (r) => r.name },
          { key: "rev", header: "Rev", width: 60, align: "center", render: (r) => r.rev },
          { key: "program", header: "Program", width: 90, render: (r) => r.program },
          { key: "surface", header: "Surface dm²", width: 105, align: "right", render: (r) => r.surface },
          { key: "status", header: "Status", width: 100, render: () => <ErpStatus label="ACTIVE" tone="success" /> },
          { key: "action", header: "", width: 74, align: "center", render: () => <button className="erpkit-link-button">Edit</button> },
        ]} footer={<><span>{rows.length} sample rows</span><span>Page 1 / 625</span></>} />
      </div>
    </div>
  );
}

function ConfigOverview() {
  const stages = [
    ["01–04", "Định nghĩa Operation", "Operation Code → Source Mapping → Main Operation", "success"],
    ["05–08", "Tổ chức & trách nhiệm", "ST Group → Physical Area → Schedule Area → Planner", "success"],
    ["09", "Recipe & Batch Key", "Xác định recipe và điều kiện gom lô", "info"],
    ["10–11", "Process Time", "Loading / Process / Unloading", "warning"],
    ["12", "Open Job Column Values", "Từ điển dữ liệu dùng cho rule", "success"],
  ] as const;
  return <>
    <ErpPageHeader eyebrow="Configuration" title="Tổng quan Cấu hình" description="Luồng cấu hình theo đúng thứ tự phụ thuộc trước khi Planning." status={<ErpStatus label="SYSTEM READY" tone="success" />} />
    <div className="erpkit-config-flow-grid">
      {stages.map(([no, title, desc, tone]) => <div className="erpkit-flow-card" key={no}><span>{no}</span><div><b>{title}</b><p>{desc}</p></div><ErpStatus label="OK" tone={tone} /></div>)}
    </div>
    <ErpSection title="Configuration health" description="Chỉ hiển thị vấn đề cần người dùng xử lý.">
      <div className="erpkit-config-health-list">
        <div><ErpStatus label="OK" tone="success" /><b>ST Scope & Mapping</b><span>148/148 operation đã mapping.</span></div>
        <div><ErpStatus label="OK" tone="success" /><b>Area & Planner</b><span>14 khu vực đã gán lane và planner.</span></div>
        <div><ErpStatus label="CHECK" tone="warning" /><b>Process Time</b><span>3 recipe chưa có time rule.</span><button className="erpkit-link-button">Open</button></div>
      </div>
    </ErpSection>
  </>;
}

function ConfigDetail({ sub }: { sub: string }) {
  const item = CONFIG_TABS.find(([key]) => key === sub) ?? CONFIG_TABS[1];
  const [, label, no] = item;
  const purpose: Record<string, string> = {
    flow: "Tạo hoặc hoàn thiện một Operation theo đúng chuỗi cấu hình bắt buộc.",
    scope: "Chọn Operation Code thuộc phạm vi ST Planning.",
    mapping: "Map RAW / Source Operation vào Main Operation.",
    operation: "Quản lý danh mục Main Operation và Main Planning Order.",
    group: "Nhóm các Main Operation theo nhóm ST.",
    area: "Gán Main Operation vào khu vực vật lý.",
    schedulearea: "Xác định lane/resource group dùng trên Board Điều Độ.",
    planner: "Phân chia trách nhiệm planner theo Schedule Area / Operation.",
    recipe: "Xác định Recipe, Batch Key và điều kiện đề xuất cho từng Main Operation.",
    loading: "Cấu hình thời gian Loading và Unloading theo Qty / Surface.",
    process: "Cấu hình Process Time theo rule Qty / Surface hoặc Fixed Hours.",
    columns: "Quản lý danh sách giá trị unique từ các cột All Open Job dùng trong rule.",
  };
  return <>
    <ErpPageHeader eyebrow={`Configuration · Step ${no}`} title={label} description={purpose[sub] ?? "Cấu hình hệ thống ST Planning."} actions={<button className="erpkit-btn erpkit-btn-primary">+ Add</button>} />
    {sub === "flow" ? <OperationWizardDemo /> : <>
      <ErpToolbar search={<MockSearch placeholder={`Tìm ${label}...`} />} filters={<select className="erpkit-select erpkit-demo-select"><option>All status</option></select>} right={<><button className="erpkit-btn">Export</button><button className="erpkit-btn">Refresh</button></>} />
      <ErpDataGrid rows={CONFIG_GENERIC_ROWS} getRowKey={(r) => r.code} columns={[
        { key: "source", header: "Operation Code", minWidth: 140, render: (r) => <span className="erpkit-grid-code erpkit-grid-link">{r.code}</span> },
        { key: "main", header: "Main Operation", minWidth: 150, render: (r) => <b>{r.main}</b> },
        { key: "group", header: "ST Group", minWidth: 130, render: (r) => r.group },
        { key: "area", header: "Area / Value", minWidth: 180, render: (r) => r.area },
        { key: "status", header: "Status", width: 116, render: () => <ErpStatus label="CONFIGURED" tone="success" /> },
        { key: "action", header: "", width: 70, render: () => <button className="erpkit-link-button">Edit</button> },
      ]} footer={<><span>4 sample configurations</span><span>ERP compact grid</span></>} />
      <div className="erpkit-demo-split" style={{ marginTop: 12 }}>
        <ErpSection title="Edit configuration" description="Form chuẩn dùng chung cho các màn hình cấu hình.">
          <ErpFormGrid columns={2}>
            <ErpField label="Operation Code" required><input className="erpkit-input" defaultValue="BSAUNSLD" /></ErpField>
            <ErpField label="Main Operation" required><select className="erpkit-select" defaultValue="CHEMICAL LINE"><option>CHEMICAL LINE</option><option>MANUALSP</option><option>PRIMER</option></select></ErpField>
            <ErpField label="ST Group"><select className="erpkit-select" defaultValue="CHEMICAL"><option>CHEMICAL</option><option>PAINT</option><option>SHOT PEENING</option></select></ErpField>
            <ErpField label="Status"><select className="erpkit-select"><option>Active</option><option>Inactive</option></select></ErpField>
          </ErpFormGrid>
          <div className="erpkit-form-actions"><button className="erpkit-btn">Cancel</button><button className="erpkit-btn erpkit-btn-primary">Save</button></div>
        </ErpSection>
        <ErpSection title="Ảnh hưởng" description="Hiển thị ngắn gọn nơi cấu hình này được sử dụng.">
          <div className="erpkit-impact-chain"><span>All Open Jobs</span><i>→</i><span>Candidate</span><i>→</i><span>Batch</span><i>→</i><span>Schedule</span></div>
        </ErpSection>
      </div>
    </>}
  </>;
}

function OperationWizardDemo() {
  const steps = ["Operation Code", "Main Operation", "ST Group", "Physical Area", "Schedule Area", "Planner"];
  return <div className="erpkit-wizard-demo">
    <div className="erpkit-wizard-steps">{steps.map((s, i) => <div className={`erpkit-wizard-step ${i < 4 ? "is-done" : i === 4 ? "is-active" : ""}`} key={s}><span>{i < 4 ? "✓" : i + 1}</span><b>{s}</b></div>)}</div>
    <ErpSection title="5. Schedule Area" description="Chọn lane điều độ cho Operation đang cấu hình.">
      <ErpFormGrid columns={2}>
        <ErpField label="Operation Code"><input className="erpkit-input" value="PRMER" readOnly /></ErpField>
        <ErpField label="Main Operation"><input className="erpkit-input" value="PRIMER" readOnly /></ErpField>
        <ErpField label="Physical Area"><input className="erpkit-input" value="Painting" readOnly /></ErpField>
        <ErpField label="Schedule Area" required><select className="erpkit-select" defaultValue="PAINT"><option value="PAINT">Painting Cabin</option><option>Powder Paint</option></select></ErpField>
      </ErpFormGrid>
      <div className="erpkit-form-actions"><button className="erpkit-btn">← Back</button><button className="erpkit-btn erpkit-btn-primary">Next: Planner →</button></div>
    </ErpSection>
  </div>;
}

function ConfigDemo() {
  const [sub, setSub] = useState<string>("overview");
  return <div className="erpkit-demo-workspace"><DemoSidebar title="CONFIGURATION" items={CONFIG_TABS} active={sub} onChange={setSub} /><div className="erpkit-demo-screen">{sub === "overview" ? <ConfigOverview /> : <ConfigDetail sub={sub} />}</div></div>;
}

function PartTrackerDemo() {
  const routing = ["CMSA", "V_M-SHPN", "BSAUNSLD", "PRIMER", "TOPCOAT1", "VARNISH"];
  return <>
    <ErpPageHeader eyebrow="Tracker" title="Part Tracker" description="Tìm Part để xem Master, Routing, Recipe và chuỗi ST liên quan." />
    <ErpToolbar search={<MockSearch placeholder="Nhập Part Number..." />} right={<button className="erpkit-btn erpkit-btn-primary">Search</button>} />
    <div className="erpkit-tracker-hero"><div><span>PART NUMBER</span><strong>65B12345-101</strong><small>Revision C · A320</small></div><ErpStatus label="ACTIVE" tone="success" /></div>
    <div className="erpkit-kpi-grid">
      <ErpKpiCard label="Surface" value="90.8" helper="dm² / piece" />
      <ErpKpiCard label="ST Operations" value="6" helper="Main planning operations" tone="info" />
      <ErpKpiCard label="Primer" value="20-T3-10" helper="EPOXY PRIMER" tone="warning" />
      <ErpKpiCard label="Topcoat" value="23-T3-10" helper="WHITE POLYURETHANE" tone="success" />
    </div>
    <ErpSection title="ST Routing" description="Chuỗi Main Operation đã chuẩn hóa từ Routing Master.">
      <div className="erpkit-routing-chain">{routing.map((op, i) => <div key={op}><span>{String(i + 1).padStart(2, "0")}</span><b>{op}</b>{i < routing.length - 1 ? <i>→</i> : null}</div>)}</div>
    </ErpSection>
    <div className="erpkit-demo-split">
      <ErpSection title="Material & Finish"><div className="erpkit-kv-grid"><KV k="Alloy" v="2024"/><KV k="Temper" v="T351"/><KV k="Primer 1" v="20-T3-10 EPOXY PRIMER"/><KV k="Topcoat" v="23-T3-10 WHITE POLYURETHANE"/></div></ErpSection>
      <ErpSection title="Routing summary"><div className="erpkit-kv-grid"><KV k="Routing Code" v="RT-ST-0184"/><KV k="ST Group" v="CHEMICAL / PAINT"/><KV k="Revision" v="C"/><KV k="Last sync" v="02 Sep 2026 06:30"/></div></ErpSection>
    </div>
  </>;
}

function KV({ k, v }: { k: string; v: ReactNode }) { return <div className="erpkit-kv"><span>{k}</span><b>{v}</b></div>; }

function JobTrackerDemo() {
  const rows = [
    ["01", "BSAUNSLD", "CHEMICAL LINE", "CHM_01SEP_003", "DONE"],
    ["02", "PRMER", "PRIMER", "PNT_02SEP_002", "SCHEDULED"],
    ["03", "TOPCOAT", "TOPCOAT1", "—", "WAIT"],
  ];
  return <>
    <ErpPageHeader eyebrow="Tracker" title="Job Tracker" description="Một nơi để tìm toàn bộ thông tin liên quan tới Job, Routing, Batch và điều độ." />
    <ErpToolbar search={<MockSearch placeholder="Nhập Job Number..." />} right={<button className="erpkit-btn erpkit-btn-primary">Search</button>} />
    <div className="erpkit-tracker-hero"><div><span>JOB</span><strong>J260902-0184</strong><small>Part 65B12345-101 · Rev C · Qty 24</small></div><ErpStatus status="SCHEDULED" /></div>
    <div className="erpkit-kpi-grid">
      <ErpKpiCard label="Qty" value="24" helper="Open quantity" />
      <ErpKpiCard label="Surface Total" value="2,180" helper="dm²" tone="info" />
      <ErpKpiCard label="Next Main" value="PRIMER" helper="NextOperation: PRMER" tone="warning" />
      <ErpKpiCard label="Current Batch" value="PNT_02SEP_002" helper="CAB1 · 10:30" tone="success" />
    </div>
    <ErpSection title="Planning & Routing history" flush>
      <ErpDataGrid rows={rows} getRowKey={(r) => r[0]} columns={[
        {key:"seq",header:"Seq",width:55,align:"center",render:r=>r[0]},
        {key:"raw",header:"Operation Code",minWidth:130,render:r=><span className="erpkit-grid-code">{r[1]}</span>},
        {key:"main",header:"Main Operation",minWidth:150,render:r=><b>{r[2]}</b>},
        {key:"batch",header:"Batch",minWidth:150,render:r=><span className="erpkit-grid-code erpkit-grid-link">{r[3]}</span>},
        {key:"status",header:"Status",minWidth:110,render:r=><ErpStatus label={r[4]} tone={r[4]==="DONE"?"success":r[4]==="SCHEDULED"?"info":"warning"}/>},
      ]} />
    </ErpSection>
    <div className="erpkit-demo-split">
      <ErpSection title="Schedule"><div className="erpkit-kv-grid"><KV k="Resource" v="CAB1"/><KV k="Date" v="02 Sep 2026"/><KV k="Start" v="10:30"/><KV k="End" v="17:30"/></div></ErpSection>
      <ErpSection title="Recipe"><div className="erpkit-kv-grid"><KV k="Recipe No." v="003"/><KV k="Recipe" v="20-T3-10 EPOXY PRIMER"/><KV k="Source" v="PRIMER1"/><KV k="Batch Key" v="PAINT|PRIMER|20-T3-10"/></div></ErpSection>
    </div>
  </>;
}

function OpenJobsDemo() {
  const [view, setView] = useState<"current" | "history">("current");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => OPEN_JOBS.filter(j => !q || `${j.job} ${j.part} ${j.nextOperation} ${j.main}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return <>
    <ErpPageHeader eyebrow="Open Jobs" title="All Open Jobs" description="Snapshot công việc đang mở và dữ liệu nguồn cho Candidate Jobs." actions={<><button className="erpkit-btn">Export</button><button className="erpkit-btn erpkit-btn-primary">Import / Refresh</button></>} />
    <LocalTabs active={view} onChange={(x)=>setView(x as "current"|"history")} items={[["current","Current Jobs",1284],["history","Change History",64]] as const} />
    {view === "current" ? <>
      <div className="erpkit-kpi-grid"><ErpKpiCard label="Open Jobs" value="1,284"/><ErpKpiCard label="New" value="38" tone="info"/><ErpKpiCard label="Changed" value="46" tone="warning"/><ErpKpiCard label="Unchanged" value="1,200" tone="success"/></div>
      <ErpToolbar search={<div className="erpkit-search"><input className="erpkit-input" value={q} onChange={(e:ChangeEvent<HTMLInputElement>)=>setQ(e.target.value)} placeholder="Tìm Job, Part, NextOperation..." /></div>} filters={<><span className="erpkit-filter-chip">Program: <b>All</b></span><span className="erpkit-filter-chip">Main: <b>All</b></span></>} right={<><button className="erpkit-btn">Filters</button><button className="erpkit-btn">Columns</button></>} />
      <ErpDataGrid rows={filtered} columns={JOB_COLUMNS} getRowKey={r=>r.id} footer={<><span>{filtered.length} sample rows</span><span>1–50 of 1,284</span></>} />
    </> : <HistoryDemo />}
  </>;
}

function HistoryDemo() {
  const rows = [
    {id:1,time:"02 Sep 06:30",job:"J260902-0184",field:"NextOperation",old:"CMSA",next:"BSAUNSLD",type:"CHANGED"},
    {id:2,time:"02 Sep 06:30",job:"J260902-0311",field:"Job",old:"—",next:"NEW",type:"NEW"},
    {id:3,time:"01 Sep 06:28",job:"J260901-0212",field:"Qty",old:"48",next:"60",type:"CHANGED"},
  ];
  return <ErpSection title="Change History" description="Chỉ ghi NEW / CHANGED giữa hai lần import." flush><ErpDataGrid rows={rows} getRowKey={r=>r.id} columns={[
    {key:"time",header:"Import time",minWidth:120,render:r=>r.time},{key:"job",header:"Job",minWidth:130,render:r=><span className="erpkit-grid-code">{r.job}</span>},{key:"field",header:"Changed field",minWidth:140,render:r=>r.field},{key:"old",header:"Previous",minWidth:130,render:r=>r.old},{key:"next",header:"Current",minWidth:130,render:r=><b>{r.next}</b>},{key:"type",header:"Type",width:100,render:r=><ErpStatus label={r.type} tone={r.type==="NEW"?"success":"warning"}/>},
  ]}/></ErpSection>;
}

const MATRIX_OPERATIONS: ErpPlanningMatrixOperation[] = [
  { key: "chemical", label: "CHEMICAL LINE", shortLabel: "CHEM", order: 10 },
  { key: "manualsp", label: "MANUALSP", shortLabel: "M-SP", order: 20 },
  { key: "adblst", label: "A-DBLST", shortLabel: "A-DB", order: 30 },
  { key: "mdblst", label: "M-DBLST", shortLabel: "M-DB", order: 40 },
  { key: "primer", label: "PRIMER", shortLabel: "PRIMER", order: 50 },
  { key: "topcoat", label: "TOPCOAT1", shortLabel: "TOP1", order: 60 },
  { key: "marking", label: "PAINT MARKING", shortLabel: "MARK", order: 70 },
  { key: "varnish", label: "VARNISH", shortLabel: "VRNS", order: 80 },
];

const MATRIX_ROWS: ErpPlanningMatrixRow[] = [
  {
    id: "m1", job: "J260902-0184", part: "65B12345-101", revision: "C", qty: 24, surface: 2180, priority: "cat3",
    cells: {
      chemical: { status: "READY", rawOperation: "BSAUNSLD", recipe: "ANODIZING BSA UNSEALED", previousBatch: "CHM_01SEP_003" },
      primer: { status: "WAIT", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER" },
      topcoat: { status: "WAIT", rawOperation: "TOPCOAT", recipe: "23-T3-10 WHITE POLYURETHANE" },
    },
  },
  {
    id: "m2", job: "J260902-0212", part: "65B22810-203", revision: "A", qty: 60, surface: 1560, priority: "sales",
    cells: {
      chemical: { status: "DONE", rawOperation: "CMSA", batchNo: "CHM_01SEP_001" },
      manualsp: { status: "READY", rawOperation: "V_M-SHPN", recipe: "V_M-SHPN", previousBatch: "CHM_01SEP_001" },
      adblst: { status: "WAIT", rawOperation: "A-DBLST" },
      primer: { status: "WAIT", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER" },
    },
  },
  {
    id: "m3", job: "J260902-0227", part: "65B31007-015", revision: "B", qty: 18, surface: 720, priority: "normal",
    cells: {
      chemical: { status: "DONE", rawOperation: "BSAUNSLD", batchNo: "CHM_01SEP_005" },
      manualsp: { status: "DONE", rawOperation: "V_M-SHPN", batchNo: "MSP_01SEP_004" },
      adblst: { status: "READY", rawOperation: "A-DBLST", recipe: "AUTO BLAST" },
      primer: { status: "WAIT", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER" },
      topcoat: { status: "WAIT", rawOperation: "TOPCOAT" },
    },
  },
  {
    id: "m4", job: "J260902-0241", part: "65B41120-001", revision: "D", qty: 42, surface: 3840, priority: "cat5",
    cells: {
      chemical: { status: "DONE", rawOperation: "TSAUNSL", batchNo: "CHM_01SEP_006" },
      primer: { status: "BATCH", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER", batchNo: "PNT_02SEP_002" },
      topcoat: { status: "WAIT", rawOperation: "TOPCOAT", recipe: "23-T3-10 WHITE POLYURETHANE" },
      marking: { status: "WAIT", rawOperation: "MRKG-PA" },
      varnish: { status: "WAIT", rawOperation: "V_VRNS" },
    },
  },
  {
    id: "m5", job: "J260902-0259", part: "65B55004-009", revision: "A", qty: 120, surface: 5310, priority: "normal",
    cells: {
      chemical: { status: "DONE", rawOperation: "CCNV-IM", batchNo: "CHM_01SEP_008" },
      mdblst: { status: "DONE", rawOperation: "M-DBLST", batchNo: "MDB_01SEP_003" },
      primer: { status: "SCHEDULED", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER", batchNo: "PNT_02SEP_003" },
      topcoat: { status: "WAIT", rawOperation: "TOPCOAT", recipe: "23-T3-10 WHITE POLYURETHANE" },
    },
  },
  {
    id: "m6", job: "J260902-0280", part: "65B60012-021", revision: "B", qty: 80, surface: 4120, priority: "current month",
    cells: {
      chemical: { status: "READY", rawOperation: "BSAUNSLD", recipe: "ANODIZING BSA UNSEALED", previousBatch: "CHM_01SEP_009" },
      primer: { status: "WAIT", rawOperation: "PRMER", recipe: "20-T3-10 EPOXY PRIMER" },
      topcoat: { status: "WAIT", rawOperation: "TOPCOAT", recipe: "23-T3-10 WHITE POLYURETHANE" },
      marking: { status: "NO_CHAIN", rawOperation: "MRKG-PA" },
    },
  },
];

function matrixCellKey(rowId: string | number, operationKey: string) {
  return `${rowId}::${operationKey}`;
}

function PlanningDemo() {
  const [view, setView] = useState<"matrix" | "candidate" | "batches">("matrix");
  const [mode, setMode] = useState<"compact" | "detail">("compact");
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([1, 2]);
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<ErpPlanningMatrixSelection>({ rowId: "m1", operationKey: "chemical" });
  const [batchCells, setBatchCells] = useState<string[]>(["m1::chemical", "m6::chemical"]);

  const selectedRow = MATRIX_ROWS.find((row) => row.id === selectedMatrixCell.rowId) ?? MATRIX_ROWS[0];
  const selectedOperation = MATRIX_OPERATIONS.find((operation) => operation.key === selectedMatrixCell.operationKey) ?? MATRIX_OPERATIONS[0];
  const selectedCell: ErpPlanningMatrixCell | undefined = selectedRow.cells[selectedOperation.key];
  const selectedBatchRows = batchCells
    .map((key) => MATRIX_ROWS.find((row) => key.startsWith(`${row.id}::`)))
    .filter((row): row is ErpPlanningMatrixRow => Boolean(row));
  const selectedQty = selectedBatchRows.reduce((sum, row) => sum + row.qty, 0);
  const selectedSurface = selectedBatchRows.reduce((sum, row) => sum + (row.surface ?? 0), 0);
  const readyCount = MATRIX_ROWS.reduce((sum, row) => sum + Object.values(row.cells).filter((cell) => cell?.status === "READY").length, 0);
  const waitCount = MATRIX_ROWS.reduce((sum, row) => sum + Object.values(row.cells).filter((cell) => cell?.status === "WAIT").length, 0);

  function onMatrixCellClick(row: ErpPlanningMatrixRow, operation: ErpPlanningMatrixOperation, cell: ErpPlanningMatrixCell) {
    setSelectedMatrixCell({ rowId: row.id, operationKey: operation.key });
    if (cell.status !== "READY") return;

    const key = matrixCellKey(row.id, operation.key);
    setBatchCells((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      const first = current[0]?.split("::")[1];
      if (first && first !== operation.key) return [key];
      return [...current, key];
    });
  }

  const createCount = view === "matrix" ? batchCells.length : view === "candidate" ? selectedCandidates.length : 0;

  return <>
    <ErpPageHeader
      eyebrow="Planning"
      title="Planning Board"
      description="Matrix theo Job × Main Operation để nhìn toàn bộ chuỗi, chọn READY và tạo Batch."
      actions={<button className="erpkit-btn erpkit-btn-primary" disabled={view === "batches"}>Create Batch ({createCount})</button>}
    />
    <LocalTabs
      active={view}
      onChange={(x) => setView(x as "matrix" | "candidate" | "batches")}
      items={[["matrix", "Matrix", MATRIX_ROWS.length], ["candidate", "Candidate Jobs", 245], ["batches", "Recent Planning Batches", 18]] as const}
    />

    {view === "matrix" ? <>
      <div className="erpkit-kpi-grid">
        <ErpKpiCard label="READY cells" value={readyCount} tone="success" />
        <ErpKpiCard label="WAIT cells" value={waitCount} tone="warning" />
        <ErpKpiCard label="Selected" value={batchCells.length} tone="info" />
        <ErpKpiCard label="Selected Surface" value={selectedSurface.toLocaleString()} helper="dm²" />
      </div>

      <ErpToolbar
        search={<MockSearch placeholder="Tìm Job / Part trong Matrix..." />}
        filters={<>
          <select className="erpkit-select erpkit-demo-select"><option>All Main Operation</option><option>CHEMICAL LINE</option><option>PRIMER</option></select>
          <span className="erpkit-filter-chip">Priority: <b>All</b></span>
        </>}
        selection={batchCells.length ? <span className="erpkit-toolbar-selection"><b>{batchCells.length}</b> READY selected · Qty {selectedQty}</span> : null}
        right={<>
          <div className="erpkit-segmented" aria-label="Matrix density">
            <button type="button" className={mode === "compact" ? "is-active" : ""} onClick={() => setMode("compact")}>Compact</button>
            <button type="button" className={mode === "detail" ? "is-active" : ""} onClick={() => setMode("detail")}>Detail</button>
          </div>
          <button className="erpkit-btn">Filter</button>
          <button className="erpkit-btn">Columns</button>
        </>}
      />

      <div className="erpkit-matrix-legend">
        {(["DONE", "READY", "WAIT", "BATCH", "SCHEDULED", "NO_CHAIN"] as const).map((status) => (
          <span key={status} className={`is-${status.toLowerCase().replace("_", "-")}`}><i />{status === "NO_CHAIN" ? "NO CHAIN" : status}</span>
        ))}
        <small>Click READY để chọn/bỏ chọn · click cell khác để xem chi tiết</small>
      </div>

      <ErpPlanningMatrix
        operations={MATRIX_OPERATIONS}
        rows={MATRIX_ROWS}
        mode={mode}
        selected={selectedMatrixCell}
        selectedBatchCells={batchCells}
        onCellClick={onMatrixCellClick}
      />

      <div className="erpkit-demo-split erpkit-matrix-bottom" style={{ marginTop: 12 }}>
        <ErpSection title="Selected Cell" description="Chi tiết Job / Operation đang chọn.">
          <div className="erpkit-kv-grid">
            <KV k="Job" v={selectedRow.job} />
            <KV k="Part / Rev" v={`${selectedRow.part} / ${selectedRow.revision}`} />
            <KV k="Main Operation" v={selectedOperation.label} />
            <KV k="RAW Operation" v={selectedCell?.rawOperation ?? "—"} />
            <KV k="Status" v={selectedCell?.status.replace("_", " ") ?? "—"} />
            <KV k="Recipe" v={selectedCell?.recipe ?? "—"} />
            <KV k="Batch" v={selectedCell?.batchNo ?? "—"} />
            <KV k="Previous Batch" v={selectedCell?.previousBatch ?? "—"} />
          </div>
        </ErpSection>
        <ErpSection title="Batch Selection" description="Matrix khóa lựa chọn theo cùng Main Operation.">
          <div className="erpkit-compat-list">
            <div><ErpStatus label="MATCH" tone="success" /><span>Main Operation</span><b>{batchCells.length ? MATRIX_OPERATIONS.find((op) => op.key === batchCells[0].split("::")[1])?.label : "—"}</b></div>
            <div><ErpStatus label="MATCH" tone="success" /><span>Selected Jobs</span><b>{batchCells.length} jobs · Qty {selectedQty}</b></div>
            <div><ErpStatus label="MATCH" tone="success" /><span>Surface</span><b>{selectedSurface.toLocaleString()} dm²</b></div>
          </div>
          <div className="erpkit-form-actions">
            <button className="erpkit-btn" onClick={() => setBatchCells([])}>Clear</button>
            <button className="erpkit-btn erpkit-btn-primary" disabled={!batchCells.length}>Create Batch ({batchCells.length})</button>
          </div>
        </ErpSection>
      </div>
    </> : view === "candidate" ? <>
      <div className="erpkit-kpi-grid"><ErpKpiCard label="READY" value="245" tone="success"/><ErpKpiCard label="WAIT" value="84" tone="warning"/><ErpKpiCard label="Selected" value={selectedCandidates.length} tone="info"/><ErpKpiCard label="Total Surface" value="3,740" helper="dm² selected"/></div>
      <ErpToolbar search={<MockSearch placeholder="Tìm Candidate..." />} filters={<><select className="erpkit-select erpkit-demo-select"><option>All Main Operation</option><option>CHEMICAL LINE</option><option>PRIMER</option></select><span className="erpkit-filter-chip">Recipe: <b>All</b></span></>} selection={<span className="erpkit-toolbar-selection">{selectedCandidates.length} selected</span>} right={<><button className="erpkit-btn">Sort</button><button className="erpkit-btn">Columns</button></>} />
      <ErpDataGrid rows={OPEN_JOBS} getRowKey={r=>r.id} selectedRowKey={selectedCandidates[0]} columns={[
        {key:"pick",header:"",width:38,align:"center",render:r=><input type="checkbox" checked={selectedCandidates.includes(r.id)} onChange={()=>setSelectedCandidates(s=>s.includes(r.id)?s.filter(x=>x!==r.id):[...s,r.id])}/>},
        ...JOB_COLUMNS,
      ]} footer={<><span>Main Planning Order → Operation Order → Priority → Job</span><span>245 READY</span></>} />
      <div className="erpkit-demo-split" style={{marginTop:12}}>
        <ErpSection title="Batch Compatibility" description="Tóm tắt điều kiện từ các Job đang chọn."><div className="erpkit-compat-list"><div><ErpStatus label="MATCH" tone="success"/><span>Main Operation</span><b>CHEMICAL LINE</b></div><div><ErpStatus label="MATCH" tone="success"/><span>Recipe</span><b>ANODIZING BSA UNSEALED</b></div><div><ErpStatus label="CHECK" tone="warning"/><span>Previous Batch</span><b>2 groups</b></div></div></ErpSection>
        <ErpSection title="Create Batch"><ErpFormGrid columns={1}><ErpField label="Batch Key"><input className="erpkit-input" value="CHEMICAL_LINE|ANOD_BSA" readOnly/></ErpField><ErpField label="Recipe"><select className="erpkit-select"><option>ANODIZING BSA UNSEALED</option></select></ErpField></ErpFormGrid><div className="erpkit-form-actions"><button className="erpkit-btn erpkit-btn-primary">Create Batch</button></div></ErpSection>
      </div>
    </> : <BatchListDemo />}
  </>;
}

function BatchListDemo() {
  return <><div className="erpkit-kpi-grid"><ErpKpiCard label="Today" value="18"/><ErpKpiCard label="Unscheduled" value="7" tone="warning"/><ErpKpiCard label="Scheduled" value="9" tone="info"/><ErpKpiCard label="Done" value="2" tone="success"/></div><ErpToolbar search={<MockSearch placeholder="Tìm Batch..."/>} filters={<select className="erpkit-select erpkit-demo-select"><option>All status</option></select>} right={<button className="erpkit-btn">Refresh</button>}/><ErpDataGrid rows={BATCHES} getRowKey={r=>r.id} columns={[
    {key:"status",header:"Status",minWidth:110,render:r=><ErpStatus status={r.status}/>},{key:"batch",header:"Batch No.",minWidth:150,render:r=><span className="erpkit-grid-code erpkit-grid-link">{r.batch}</span>},{key:"op",header:"Main Operation",minWidth:145,render:r=><b>{r.operation}</b>},{key:"recipe",header:"Recipe",minWidth:220,render:r=>r.recipe},{key:"jobs",header:"Jobs",width:65,align:"right",render:r=>r.jobs},{key:"qty",header:"Qty",width:70,align:"right",render:r=>r.qty},{key:"surface",header:"dm²",width:85,align:"right",render:r=>r.surface},{key:"action",header:"",width:80,render:()=> <button className="erpkit-link-button">Open</button>},
  ]}/></>;
}

function MaskingDemo() {
  const [view,setView]=useState<"masking"|"unmasking">("masking");
  const rows = OPEN_JOBS.slice(0,4);
  return <>
    <ErpPageHeader eyebrow="Planning" title="Masking / Unmasking" description="Kế hoạch riêng cho công đoạn Masking và Unmasking theo Job / Batch." actions={<button className="erpkit-btn erpkit-btn-primary">Create {view === "masking" ? "Masking" : "Unmasking"} Batch</button>} />
    <LocalTabs active={view} onChange={x=>setView(x as "masking"|"unmasking")} items={[["masking","Masking Queue",38],["unmasking","Unmasking Queue",22]] as const}/>
    <div className="erpkit-kpi-grid"><ErpKpiCard label="Ready Jobs" value={view==="masking"?"38":"22"} tone="success"/><ErpKpiCard label="Selected" value="4" tone="info"/><ErpKpiCard label="Qty" value="144"/><ErpKpiCard label="Surface" value="7,210" helper="dm²"/></div>
    <ErpToolbar search={<MockSearch placeholder={`Tìm ${view} Job...`}/>} filters={<><span className="erpkit-filter-chip">Previous Batch: <b>All</b></span><span className="erpkit-filter-chip">Program: <b>All</b></span></>} right={<button className="erpkit-btn">Columns</button>}/>
    <ErpDataGrid rows={rows} getRowKey={r=>r.id} columns={[
      {key:"pick",header:"",width:38,render:()=> <input type="checkbox" defaultChecked/>},
      {key:"job",header:"Job",minWidth:130,render:r=><span className="erpkit-grid-code erpkit-grid-link">{r.job}</span>},
      {key:"part",header:"Part / Rev",minWidth:160,render:r=><>{r.part} / <b>{r.rev}</b></>},
      {key:"qty",header:"Qty",width:70,align:"right",render:r=>r.qty},
      {key:"surface",header:"Surface dm²",width:105,align:"right",render:r=>r.surface.toLocaleString()},
      {key:"prev",header:"Previous Batch",minWidth:145,render:r=><span className="erpkit-grid-code">{r.previousBatch}</span>},
      {key:"status",header:"Status",width:105,render:()=> <ErpStatus status="READY"/>},
    ]}/>
  </>;
}

type ScheduleBlock = { start: number; width: number; label: string; sub: string; tone: string };
const LANES: { lane: string; blocks: ScheduleBlock[] }[] = [
  { lane:"Manual DBL", blocks:[{start:4,width:16,label:"MDB_02SEP_001",sub:"06:30–09:00",tone:"blue"},{start:31,width:20,label:"MDB_02SEP_002",sub:"11:00–14:00",tone:"green"}] },
  { lane:"Auto DBL", blocks:[{start:12,width:21,label:"ADB_02SEP_001",sub:"08:00–11:30",tone:"purple"}] },
  { lane:"Chemical FB1", blocks:[{start:7,width:28,label:"CHM_02SEP_001",sub:"07:00–12:00",tone:"blue"},{start:51,width:24,label:"CHM_02SEP_004",sub:"14:00–18:00",tone:"green"}] },
  { lane:"Chemical FB2", blocks:[{start:18,width:30,label:"CHM_02SEP_002",sub:"09:00–14:00",tone:"orange"}] },
  { lane:"Painting CAB1", blocks:[{start:35,width:35,label:"PNT_02SEP_002",sub:"11:30–17:30",tone:"purple"}] },
  { lane:"Painting CAB2", blocks:[{start:10,width:24,label:"PNT_02SEP_001",sub:"07:30–11:30",tone:"green"},{start:58,width:23,label:"PNT_02SEP_003",sub:"15:00–19:00",tone:"blue"}] },
];

function ScheduleDemo() {
  return <>
    <ErpPageHeader eyebrow="Scheduling" title="Board Điều Độ" description="Gán Resource / Date / Start / Duration cho các Batch UNSCHEDULED." actions={<><button className="erpkit-btn">Today</button><button className="erpkit-btn erpkit-btn-primary">Save Schedule</button></>} />
    <div className="erpkit-kpi-grid"><ErpKpiCard label="Unscheduled" value="18" tone="warning"/><ErpKpiCard label="Scheduled" value="31" tone="info"/><ErpKpiCard label="Running" value="6" tone="success"/><ErpKpiCard label="Resources" value="17" helper="Visible lanes"/></div>
    <div className="erpkit-schedule-toolbar"><div><button className="erpkit-btn">←</button><button className="erpkit-btn"><b>02 Sep 2026</b></button><button className="erpkit-btn">→</button></div><div><span className="erpkit-status erpkit-status-warning"><span className="erpkit-status-dot"/>Unscheduled 18</span><button className="erpkit-btn">Resource filter</button></div></div>
    <ErpSection title="Production Timeline · 06:00 → 06:00" description="Demo lane timeline compact; kéo/thả sẽ được áp khi migrate thật." flush>
      <div className="erpkit-timeline">
        <div className="erpkit-timeline-head"><span>Resource</span><div>{["06","09","12","15","18","21","00","03","06"].map(x=><b key={x}>{x}:00</b>)}</div></div>
        {LANES.map(row=><div className="erpkit-timeline-row" key={row.lane}><strong>{row.lane}</strong><div className="erpkit-timeline-track">{row.blocks.map((b,i)=><div key={i} className={`erpkit-schedule-block is-${b.tone}`} style={{left:`${b.start}%`,width:`${b.width}%`}}><b>{b.label}</b><small>{b.sub}</small></div>)}</div></div>)}
      </div>
    </ErpSection>
    <ErpSection title="Unscheduled Batches" flush><ErpDataGrid rows={BATCHES.filter(b=>b.status==="UNSCHEDULED")} getRowKey={r=>r.id} columns={[
      {key:"batch",header:"Batch",minWidth:150,render:r=><span className="erpkit-grid-code erpkit-grid-link">{r.batch}</span>},{key:"op",header:"Operation",minWidth:140,render:r=>r.operation},{key:"recipe",header:"Recipe",minWidth:220,render:r=>r.recipe},{key:"qty",header:"Qty",width:70,align:"right",render:r=>r.qty},{key:"surface",header:"dm²",width:90,align:"right",render:r=>r.surface},{key:"action",header:"",width:110,render:()=> <button className="erpkit-btn erpkit-btn-primary">Schedule</button>},
    ]}/></ErpSection>
  </>;
}

function ImportDemo() {
  const rows = [
    {id:1,file:"Partinfo_Used for Surface Treatment - 20260902.xlsx",time:"02 Sep 2026 06:30",new:38,changed:46,unchanged:1200,status:"Completed"},
    {id:2,file:"Partinfo_Used for Surface Treatment - 20260901.xlsx",time:"01 Sep 2026 06:28",new:22,changed:31,unchanged:1187,status:"Completed"},
    {id:3,file:"Partinfo_Used for Surface Treatment - 20260831.xlsx",time:"31 Aug 2026 06:33",new:18,changed:52,unchanged:1164,status:"Completed"},
  ];
  return <>
    <ErpPageHeader eyebrow="Data Import" title="Import Master" description="Full lần đầu; các lần sau chỉ xử lý NEW / CHANGED, giữ lịch sử và inactive dữ liệu mất khỏi file." />
    <div className="erpkit-import-layout">
      <ErpSection title="Import file" description="Kéo thả hoặc chọn file Excel Master."><div className="erpkit-dropzone"><div>⇧</div><b>Drop .xlsx file here</b><span>Partinfo_Used for Surface Treatment - *.xlsx</span><button className="erpkit-btn erpkit-btn-primary">Choose file</button></div></ErpSection>
      <ErpSection title="Import policy"><div className="erpkit-policy-list"><div><b>NEW</b><span>Thêm Part / Revision / Routing mới.</span></div><div><b>CHANGED</b><span>Cập nhật record thay đổi và rebuild routing bị ảnh hưởng.</span></div><div><b>UNCHANGED</b><span>Bỏ qua để import nhanh.</span></div><div><b>MISSING</b><span>Chuyển inactive, không xóa.</span></div></div></ErpSection>
    </div>
    <ErpSection title="Lịch sử Import" flush><ErpDataGrid rows={rows} getRowKey={r=>r.id} columns={[
      {key:"file",header:"File",minWidth:320,render:r=><b>{r.file}</b>},{key:"time",header:"Imported at",minWidth:150,render:r=>r.time},{key:"new",header:"New",width:70,align:"right",render:r=><b>{r.new}</b>},{key:"changed",header:"Changed",width:80,align:"right",render:r=>r.changed},{key:"unchanged",header:"Unchanged",width:95,align:"right",render:r=>r.unchanged},{key:"status",header:"Status",width:110,render:()=> <ErpStatus label="COMPLETED" tone="success"/>},
    ]}/></ErpSection>
  </>;
}

function GuideDemo() {
  const [section,setSection]=useState("flow");
  const items = [["flow","Luồng tổng thể"],["candidate","Candidate Jobs"],["batch","Batch & Recipe"],["schedule","Board Điều Độ"],["config","Mapping cấu hình"],["impact","Ảnh hưởng thay đổi"]] as const;
  const content:Record<string,{title:string;desc:string;steps:string[]}>={
    flow:{title:"Luồng tổng thể ST Planning",desc:"Từ dữ liệu nguồn đến kế hoạch và điều độ.",steps:["Import Master & All Open Job","Xác định RAW NextOperation","Mapping sang Main Operation","Candidate READY / WAIT","Tạo Batch theo Recipe / Batch Key","Điều độ Resource / Start / Duration"]},
    candidate:{title:"Candidate Jobs",desc:"Candidate đi theo chuỗi Main Operation thay vì hard-code RAW Operation.",steps:["Đọc RAW NextOperation","ST Operation Mapping","Main Operation","Main Planning Order","Priority Job","Job No."]},
    batch:{title:"Batch & Recipe",desc:"Manual và Auto dùng chung Batch data model.",steps:["Chọn Candidate","Kiểm tra Compatibility","Đề xuất Recipe","Sinh / nhập Batch Key","Create Batch","Đưa vào UNSCHEDULED"]},
    schedule:{title:"Board Điều Độ",desc:"Batch đã tạo mới được gán tài nguyên và thời gian.",steps:["Chọn UNSCHEDULED Batch","Chọn Resource","Nhập Start","Tính Duration","Kiểm tra overlap","Lưu Schedule"]},
    config:{title:"Mapping cấu hình",desc:"Chuỗi cấu hình quyết định dữ liệu phía sau.",steps:["Operation Code","Main Operation","ST Group","Physical Area","Schedule Area","Planner"]},
    impact:{title:"Ảnh hưởng khi thay đổi",desc:"Mỗi thay đổi cần biết downstream nào sẽ bị tác động.",steps:["Mapping → Candidate Main Operation","Recipe Rule → Batch proposal","Process Time → Schedule duration","Area Mapping → Schedule lane","Planner Assignment → Ownership","Master Import → Affected routing"]},
  };
  const c=content[section];
  return <div className="erpkit-demo-workspace"><DemoSidebar title="LOGIC & GUIDE" items={items} active={section} onChange={setSection}/><div className="erpkit-demo-screen">
    <ErpPageHeader eyebrow="Documentation" title={c.title} description={c.desc}/>
    <ErpSection title="Flow"><div className="erpkit-guide-flow">{c.steps.map((s,i)=><div key={s}><span>{String(i+1).padStart(2,"0")}</span><b>{s}</b>{i<c.steps.length-1?<i>↓</i>:null}</div>)}</div></ErpSection>
    <div className="erpkit-demo-split"><ErpSection title="Nguyên tắc"><ul className="erpkit-guide-list"><li>Không hard-code công đoạn trong Planning Board.</li><li>Mapping/config là nguồn chuẩn duy nhất.</li><li>Batch chỉ tạo một lần; Board Điều Độ không tạo lại Batch.</li><li>Manual và Auto dùng chung data model.</li></ul></ErpSection><ErpSection title="Khi thay đổi"><div className="erpkit-notice-box"><b>Impact first</b><span>Hiển thị rõ chức năng downstream bị ảnh hưởng trước khi Save cấu hình.</span></div></ErpSection></div>
  </div></div>;
}

function LocalTabs({ items, active, onChange }: { items: readonly (readonly [string,string,number?])[]; active: string; onChange: (key:string)=>void }) {
  return <div className="erpkit-local-tabs">{items.map(([key,label,count])=><button type="button" key={key} className={active===key?"is-active":""} onClick={()=>onChange(key)}><span>{label}</span>{typeof count==="number"?<b>{count}</b>:null}</button>)}</div>;
}

export function ErpAllTabsDemo() {
  const [active, setActive] = useState<MainTab>("master");
  const screen: Record<MainTab, ReactNode> = {
    master: <MasterDataDemo />,
    config: <ConfigDemo />,
    part: <PartTrackerDemo />,
    job: <JobTrackerDemo />,
    jobs: <OpenJobsDemo />,
    planning: <PlanningDemo />,
    masking: <MaskingDemo />,
    schedule: <ScheduleDemo />,
    import: <ImportDemo />,
    guide: <GuideDemo />,
  };
  return <>
    <div className="erpkit-demo-note"><b>ERP All Tabs Demo.</b> Toàn bộ dữ liệu trong trang này là dữ liệu mẫu, không đọc/ghi database. Bấm các tab bên dưới để duyệt giao diện trước khi migrate thật.</div>
    <DemoModuleTabs active={active} onChange={setActive} />
    <div className="erpkit-demo-canvas">{screen[active]}</div>
  </>;
}
