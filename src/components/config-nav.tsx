import Link from "next/link";
import {cache} from "react";
import {getPool} from "@/lib/db";

/**
 * Cấu hình v2 — "Cấu hình theo luồng"
 * Sidebar là bản đồ luồng 14 bước (2 tầng), mỗi mục có chấm trạng thái đọc từ DB.
 */

export type ConfigFlowItem = {
  key: string;
  label: string;
  href: string;
  no?: number; // số bước (B1..B14); undefined = mục đặc biệt (Tổng quan / Kết quả)
  statusKey?: keyof ConfigHealth;
};

export type ConfigHealth = {
  scope_total: number;
  mapping_missing: number;
  mapping_total: number;
  master_total: number;
  group_total: number;
  area_total: number;
  area_group_total: number;
  schedule_total: number;
  schedule_op_total: number;
  planner_assigned: number;
  chain_ok: number;
  chain_planning_total: number;
  recipe_total: number;
  recipe_op_total: number;
  handling_total: number;
  time_total: number;
  colval_total: number;
  missing_jobs: number;
};

export const getConfigHealth = cache(async (): Promise<Partial<ConfigHealth>> => {
  try {
    const c = await getPool().connect();
    try {
      const q = await c.query(`
        with active_scope as (
          select
            upper(trim(operation_code)) operation_code,
            case when bool_or(operation_type='ST_SCOPE_ONLY')
              then 'ST_SCOPE_ONLY' else 'PLANNING_OPERATION' end operation_type
          from md_st_operation_scope
          where is_active=true
          group by upper(trim(operation_code))
        ),
        chain as (
          select s.operation_code,s.operation_type,map.id map_id,om.standard_operation,
                 sg.st_group,a.id area_id,sa.schedule_area_code,sa.planner_owner
          from active_scope s
          left join lateral (
            select m.* from md_st_operation_mapping m
            where upper(trim(m.source_operation_code))=s.operation_code and m.is_active=true
            order by m.updated_at desc,m.id desc limit 1
          ) map on true
          left join md_operation_master om on om.standard_operation=map.standard_operation_rule and om.is_active=true
          left join md_st_group sg on sg.st_group=coalesce(map.st_group,om.st_group) and sg.is_active=true
          left join md_area_operation_group ag on ag.st_group=coalesce(map.st_group,om.st_group) and ag.is_active=true
          left join md_area a on a.id=ag.area_id and a.is_active=true
          left join lateral (
            select s2.schedule_area_code,coalesce(w.planner_owner,'UNASSIGNED') planner_owner
            from md_schedule_area_operation m2
            join md_schedule_area s2 on s2.schedule_area_code=m2.schedule_area_code and s2.is_active=true
            left join md_planner_work_assignment w on w.schedule_area_code=s2.schedule_area_code and w.is_active=true
            where m2.standard_operation=map.standard_operation_rule and m2.is_active=true
            order by s2.display_order limit 1
          ) sa on true
        )
        select
          (select count(*)::int from md_st_operation_scope where is_active=true) scope_total,
          (select count(*)::int from md_st_operation_mapping where is_active=true) mapping_total,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION' and map_id is null) mapping_missing,
          (select count(*)::int from md_operation_master where is_active=true) master_total,
          (select count(*)::int from md_st_group where is_active=true) group_total,
          (select count(*)::int from md_area where is_active=true) area_total,
          (select count(*)::int from md_area_operation_group where is_active=true) area_group_total,
          (select count(*)::int from md_schedule_area where is_active=true) schedule_total,
          (select count(*)::int from md_schedule_area_operation where is_active=true) schedule_op_total,
          (select count(*)::int from md_planner_work_assignment where is_active=true and planner_owner in ('1','2')) planner_assigned,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION'
             and map_id is not null and standard_operation is not null
             and st_group is not null and area_id is not null
             and schedule_area_code is not null and planner_owner in ('1','2')) chain_ok,
          (select count(*)::int from chain where operation_type='PLANNING_OPERATION') chain_planning_total,
          (select count(*)::int from md_process_recipe where is_active=true) recipe_total,
          (select count(*)::int from md_main_operation_recipe where is_active=true) recipe_op_total,
          (select count(*)::int from md_chemical_handling_time_rule where is_active=true) handling_total,
          (select count(*)::int from md_recipe_time_rule where is_active=true) time_total,
          (select count(*)::int from md_open_job_column_value where is_active=true) colval_total,
          (select count(*)::int from open_job_current j
             where j.is_open=true
               and not exists(
                 select 1 from planning_job_operation po
                 where po.job_num=j.job_num and po.is_active=true
                   and po.status in ('ELIGIBLE','PLANNED')
               )) missing_jobs
      `);
      return (q.rows[0] || {}) as Partial<ConfigHealth>;
    } finally {
      c.release();
    }
  } catch {
    return {};
  }
});

const n = (v: unknown) => Number(v || 0);

export function healthStatus(h: Partial<ConfigHealth>, key?: keyof ConfigHealth): "ok" | "warn" | "idle" {
  if (!key) return "idle";
  switch (key) {
    case "scope_total": return n(h.scope_total) > 0 ? "ok" : "warn";
    case "mapping_missing": return n(h.mapping_total) > 0 && n(h.mapping_missing) === 0 ? "ok" : "warn";
    case "master_total": return n(h.master_total) > 0 ? "ok" : "warn";
    case "group_total": return n(h.group_total) > 0 ? "ok" : "warn";
    case "area_total": return n(h.area_total) > 0 && n(h.area_group_total) > 0 ? "ok" : "warn";
    case "schedule_total": return n(h.schedule_total) > 0 && n(h.schedule_op_total) > 0 ? "ok" : "warn";
    case "planner_assigned": return n(h.schedule_total) > 0 && n(h.planner_assigned) > 0 ? "ok" : "warn";
    case "chain_ok": return n(h.chain_ok) > 0 ? "ok" : "warn";
    case "recipe_total": return n(h.recipe_total) > 0 ? "ok" : "warn";
    case "recipe_op_total": return n(h.recipe_op_total) > 0 ? "ok" : "warn";
    case "handling_total": return n(h.handling_total) > 0 ? "ok" : "warn";
    case "time_total": return n(h.time_total) > 0 ? "ok" : "warn";
    case "colval_total": return n(h.colval_total) > 0 ? "ok" : "warn";
    case "missing_jobs": return n(h.missing_jobs) > 0 ? "warn" : "ok";
    default: return "idle";
  }
}

export const CONFIG_FLOW: { tier: string; tag: string; hint?: string; items: ConfigFlowItem[] }[] = [
  {
    tier: "Tầng 1 · Định nghĩa công đoạn",
    tag: "làm 1 lần",
    items: [
      { key: "overview", label: "🏠 Tổng quan Cấu hình", href: "/settings" },
      { key: "flow", label: "Trợ lý Operation (ST Operation Flow)", href: "/st-operation-flow", no: 1 },
      { key: "operationcodeorder", label: "ST Scope", href: "/operation-code-order", no: 2, statusKey: "scope_total" },
      { key: "operationmapping", label: "Source → Main Mapping", href: "/master/operationmapping", no: 3, statusKey: "mapping_missing" },
      { key: "operation", label: "Công đoạn chính (Main Operation)", href: "/master/operation", no: 4, statusKey: "master_total" },
      { key: "stgroup", label: "ST Group (nhóm công đoạn)", href: "/st-groups", no: 5, statusKey: "group_total" },
      { key: "area", label: "Khu vực vật lý", href: "/area", no: 6, statusKey: "area_total" },
      { key: "schedulearea", label: "Khu vực điều độ (lane)", href: "/schedule-areas", no: 7, statusKey: "schedule_total" },
      { key: "plannerassignment", label: "Phân chia Planner", href: "/planner-work-assignment", no: 8, statusKey: "planner_assigned" },
      { key: "chain", label: "Kết quả: Planning Chain", href: "/st-operation-flow", no: undefined, statusKey: "chain_ok" },
    ],
  },
  {
    tier: "Tầng 2 · Công thức & Rule",
    tag: "điều khiển tạo lô",
    hint: "Chỉ cần 9–11 cho nhu cầu cơ bản (chọn Job vào lô là ra Recipe đúng). 12 tùy chọn (từ điển cột).",
    items: [
      { key: "recipeoperationmap", label: "Công thức & Rule (Recipe · Công đoạn · Mã lô)", href: "/recipe-operation-map", no: 9, statusKey: "recipe_op_total" },
      { key: "recipetimeloading", label: "Thời gian Loading / Unloading", href: "/recipe-time-loading", no: 10, statusKey: "handling_total" },
      { key: "recipetimeprocess", label: "Thời gian xử lý (Process)", href: "/recipe-time-process", no: 11, statusKey: "time_total" },
      { key: "openjobcolumnvalues", label: "Cột All Open Job (từ điển)", href: "/open-job-column-values", no: 12, statusKey: "colval_total" },
    ],
  },
];

export async function ConfigSidebar({ active }: { active: string }) {
  const h = await getConfigHealth();
  return (
    <aside className="erp-sidebar">
      <div className="erp-sidebar-title">CẤU HÌNH · THEO LUỒNG</div>
      <nav className="erp-subnav" aria-label="Cấu hình navigation">
        {CONFIG_FLOW.map((g) => (
          <div key={g.tier} className="config-nav-group">
            <div className="config-nav-group-title">{g.tier} <em>{g.tag}</em></div>
            {g.hint&&<div className="config-nav-hint">{g.hint}</div>}
            {g.items.map((x) => {
              const st = healthStatus(h, x.statusKey);
              return (
                <Link
                  key={x.key}
                  href={x.href}
                  className={`erp-subnav-item flow-item ${active === x.key ? "active" : ""}`}
                >
                  <span className={`flow-no ${st}`}>{x.no ?? (x.key === "chain" ? "✓" : "◎")}</span>
                  <span className="flow-label">{x.label}</span>
                  <span className={`flow-dot ${st}`} title={st === "ok" ? "Đã đủ" : st === "warn" ? "Cần bổ sung" : ""} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

/**
 * Header chuẩn cho mỗi trang cấu hình:
 * tiêu đề + 1 câu Mục đích + 1 câu Ảnh hưởng + nút Bước kế tiếp / Bước trước.
 */
export function ConfigPageHeader({
  title,
  subtitle,
  purpose,
  impact,
  prev,
  next,
}: {
  title: string;
  subtitle?: string;
  purpose: string;
  impact: string;
  prev?: { label: string; href: string };
  next?: { label: string; href: string };
}) {
  return (
    <>
      <div className="erp-page-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="config-page-meta">
        <div className="config-meta-purpose">
          <b>🎯 Mục đích:</b> {purpose}
        </div>
        <div className="config-meta-impact">
          <b>🔗 Ảnh hưởng:</b> {impact}
        </div>
        {(prev || next) && (
          <div className="config-flow-nav">
            {prev && (
              <Link className="btn small" href={prev.href}>
                ← {prev.label}
              </Link>
            )}
            {next && (
              <Link className="btn small primary" href={next.href}>
                {next.label} →
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}
