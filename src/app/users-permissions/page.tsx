import {ErpAppShell,ErpPageHeader} from "@/components/erp";
import {UsersPermissionsClient} from "@/components/users-permissions-client";
import {ST_ERP_MODULE_GROUPS} from "@/lib/erp/st-navigation";
import {requireAccess} from "@/lib/security/access";
export const dynamic="force-dynamic";
export default async function Page(){await requireAccess("security.manage");return <ErpAppShell moduleGroups={ST_ERP_MODULE_GROUPS} activeModule="administration" activeSecondary="security" environment="ST PLANNING">
 <ErpPageHeader eyebrow="SECURITY" title="Users & Permissions" description="Tạo account, gán Role, quyền chi tiết và phạm vi Planning / Scheduling / Production."/>
 <UsersPermissionsClient/>
 </ErpAppShell>}
