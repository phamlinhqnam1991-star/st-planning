import { ErpAppShell, type ErpNavItem } from "@/components/erp";
import {ST_ERP_MODULES,getStErpModuleItems} from "@/lib/erp/st-navigation";
import { ErpAllTabsDemo } from "@/components/erp/erp-all-tabs-demo";


const sidebar: ErpNavItem[] = [
  { key: "all-tabs", label: "Demo tất cả tab", href: "/erp-kit" },
];

export default function ErpKitPage() {
  return (
    <ErpAppShell
      moduleItems={ST_ERP_MODULES}
      activeModule="administration"
      secondaryItems={[...getStErpModuleItems("administration"),{key:"kit",label:"ERP UI Demo",href:"/erp-kit"}]}
      activeSecondary="kit"
      secondaryLabel="QUẢN TRỊ"
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
