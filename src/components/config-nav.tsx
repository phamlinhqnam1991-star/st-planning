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
