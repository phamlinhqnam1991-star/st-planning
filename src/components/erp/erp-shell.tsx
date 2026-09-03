import Link from "next/link";
import type { ReactNode } from "react";
import { ERP_UI_CONFIG } from "@/lib/erp/ui-config";
import { LanguageSwitch } from "@/components/i18n";

export type ErpNavItem = {
  key: string;
  label: string;
  href: string;
  shortLabel?: string;
};

export type ErpNavGroup = ErpNavItem & {
  items: ErpNavItem[];
};

type Props = {
  children: ReactNode;
  moduleItems?: ErpNavItem[];
  moduleGroups?: ErpNavGroup[];
  activeModule?: string;
  secondaryItems?: ErpNavItem[];
  activeSecondary?: string;
  secondaryLabel?: string;
  sidebarTitle?: string;
  sidebarItems?: ErpNavItem[];
  activeSidebar?: string;
  environment?: string;
  userArea?: ReactNode;
  breadcrumb?: ReactNode;
};

const defaultModules: ErpNavItem[] = [
  { key: "master", label: "Master Data", href: "/master-data", shortLabel: "MD" },
  { key: "config", label: "Cấu hình", href: "/settings", shortLabel: "CF" },
  { key: "tracker", label: "Tracker", href: "/job-tracker", shortLabel: "TR" },
  { key: "jobs", label: "Open Jobs", href: "/all-open-jobs", shortLabel: "OJ" },
  { key: "planning", label: "Planning", href: "/planning", shortLabel: "PL" },
  { key: "schedule", label: "Điều độ", href: "/schedule", shortLabel: "SC" },
];

export function ErpAppShell({
  children,
  moduleItems = defaultModules,
  moduleGroups = [],
  activeModule,
  secondaryItems = [],
  activeSecondary,
  secondaryLabel = "Workspace",
  sidebarTitle,
  sidebarItems = [],
  activeSidebar,
  environment = ERP_UI_CONFIG.defaultEnvironment,
  userArea,
  breadcrumb,
}: Props) {
  return (
    <main className="erpkit-app-shell">
      <header className="erpkit-app-header">
        <Link href="/master-data" className="erpkit-brand">
          <span className="erpkit-brand-mark">ST</span>
          <span>
            <strong>{ERP_UI_CONFIG.productName}</strong>
            <small>{ERP_UI_CONFIG.productArea}</small>
          </span>
        </Link>
        <div className="erpkit-header-tools">
          <LanguageSwitch/>
          <span className="erpkit-environment">{environment}</span>
          {userArea ?? <span className="erpkit-user-chip">Planner</span>}
        </div>
      </header>

      <div className="erpkit-shell-body">
        <aside className="erpkit-navigation-stack erpkit-navigation-vertical" aria-label="Điều hướng ERP">
          <div className="erpkit-navigation-caption">WORK CENTERS</div>
          {moduleGroups.length > 0 ? (
            <nav className="erpkit-module-nav erpkit-module-nav-all" aria-label="Modules">
              {moduleGroups.map((group) => (
                <section key={group.key} className="erpkit-navigation-module-group">
                  <Link href={group.href} className={`erpkit-module-link ${activeModule === group.key ? "is-active" : ""}`}>
                    <span className="erpkit-module-short">{group.shortLabel ?? group.label.slice(0, 2).toUpperCase()}</span>
                    <span>{group.label}</span>
                  </Link>
                  {group.items.length > 0 ? (
                    <div className="erpkit-context-items erpkit-context-items-always">
                      {group.items.map((item) => (
                        <Link key={item.key} href={item.href} className={`erpkit-context-link ${activeSecondary === item.key ? "is-active" : ""}`}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </nav>
          ) : (<>
            <nav className="erpkit-module-nav" aria-label="Modules">
              {moduleItems.map((item) => (
                <Link key={item.key} href={item.href} className={`erpkit-module-link ${activeModule === item.key ? "is-active" : ""}`}>
                  <span className="erpkit-module-short">{item.shortLabel ?? item.label.slice(0, 2).toUpperCase()}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            {secondaryItems.length > 0 ? (
              <nav className="erpkit-context-nav" aria-label={`${secondaryLabel} functions`}>
                <span className="erpkit-context-title">{secondaryLabel}</span>
                <div className="erpkit-context-items">
                  {secondaryItems.map((item) => (
                    <Link key={item.key} href={item.href} className={`erpkit-context-link ${activeSecondary === item.key ? "is-active" : ""}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </nav>
            ) : null}
          </>)}
        </aside>

        <div className={`erpkit-workspace ${sidebarItems.length === 0 ? "without-sidebar" : ""}`}>
        {sidebarItems.length > 0 ? (
          <aside className="erpkit-sidebar">
            {sidebarTitle ? <div className="erpkit-sidebar-title">{sidebarTitle}</div> : null}
            <nav>
              {sidebarItems.map((item) => (
                <Link key={item.key} href={item.href} className={`erpkit-sidebar-link ${activeSidebar === item.key ? "is-active" : ""}`}>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </aside>
        ) : null}
        <section className="erpkit-main">
          {breadcrumb ? <div className="erpkit-breadcrumb">{breadcrumb}</div> : null}
          {children}
        </section>
        </div>
      </div>
    </main>
  );
}
