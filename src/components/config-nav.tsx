import Link from "next/link";
import {ConfigSidebar} from "@/components/config-sidebar-client";

export {ConfigSidebar};
export {CONFIG_FLOW,healthStatus} from "@/lib/config/config-flow";
export type {ConfigFlowItem,ConfigHealth} from "@/lib/config/config-flow";

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
    <section className="erp-config-object-header" aria-label={`Cấu hình ${title}`}>
      <div className="erp-page-head erp-config-page-head">
        <div>
          <div className="erp-object-eyebrow">Configuration workspace</div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {(prev || next) && (
          <div className="config-flow-nav erp-command-actions">
            {prev && (
              <Link className="btn small" href={prev.href}>
                <span aria-hidden="true">←</span> {prev.label}
              </Link>
            )}
            {next && (
              <Link className="btn small primary" href={next.href}>
                {next.label} <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="config-page-meta erp-config-context-grid">
        <div className="config-meta-purpose erp-context-card">
          <span className="erp-context-label">Mục đích</span>
          <strong>{purpose}</strong>
        </div>
        <div className="config-meta-impact erp-context-card">
          <span className="erp-context-label">Ảnh hưởng phía sau</span>
          <strong>{impact}</strong>
        </div>
      </div>
    </section>
  );
}
