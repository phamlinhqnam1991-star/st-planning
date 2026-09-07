import Link from "next/link";
import {ERP_UI_CONFIG} from "@/lib/erp/ui-config";
import {LanguageSwitch} from "@/components/i18n";
import {getAccessContext,firstAllowedPath} from "@/lib/security/access";
import {LogoutButton} from "@/components/logout-button";

export async function ErpAppHeader({module}:{module:string}){
 const access=module==="LOGIN"?null:await getAccessContext();
 const home=access?.active?firstAllowedPath(access):"/login";
 return <header className="erp-header erp-app-header">
  <Link href={home} className="erp-brand-block" aria-label="ST Planning Master Data">
   <span className="erp-brand-mark" aria-hidden="true">ST</span>
   <div className="erp-brand-copy">
    <h1>{ERP_UI_CONFIG.productName}</h1>
    <small>{ERP_UI_CONFIG.productArea}</small>
   </div>
  </Link>
  <div className="erp-header-context" aria-label="Application context">
   <div className="erp-header-module"><small>WORKSPACE</small><strong>{module}</strong></div>
   <LanguageSwitch/>
   <span className="erp-env">{ERP_UI_CONFIG.defaultEnvironment}</span>{access?.active?<span className="erpkit-security-user"><b>{access.displayName}</b><small>{access.roles.join(" · ")||"USER"}</small><LogoutButton presentation="erp"/></span>:null}
  </div>
 </header>;
}
