import { ErpAppShell, type ErpNavItem } from "@/components/erp";
import { ErpAllTabsDemo } from "@/components/erp/erp-all-tabs-demo";

const modules: ErpNavItem[] = [
  { key: "master", label: "Master Data", href: "/master-data", shortLabel: "MD" },
  { key: "config", label: "Cấu hình", href: "/settings", shortLabel: "CF" },
  { key: "tracker", label: "Tracker", href: "/job-tracker", shortLabel: "TR" },
  { key: "jobs", label: "Open Jobs", href: "/all-open-jobs", shortLabel: "OJ" },
  { key: "planning", label: "Planning", href: "/planning", shortLabel: "PL" },
  { key: "schedule", label: "Điều độ", href: "/schedule", shortLabel: "SC" },
  { key: "kit", label: "ERP Demo", href: "/erp-kit", shortLabel: "UI" },
];

const sidebar: ErpNavItem[] = [
  { key: "all-tabs", label: "Demo tất cả tab", href: "/erp-kit" },
];

export default function ErpKitPage() {
  return (
    <ErpAppShell
      moduleItems={modules}
      activeModule="kit"
      sidebarTitle="ERP TEMPLATE KIT"
      sidebarItems={sidebar}
      activeSidebar="all-tabs"
      environment="ALL TABS PREVIEW"
      breadcrumb={<><span>ST Planning</span> / <b>ERP All Tabs Demo</b></>}
    >
      <ErpAllTabsDemo />
    </ErpAppShell>
  );
}
