import Link from "next/link";
import {ERP_UI_CONFIG} from "@/lib/erp/ui-config";
import {LanguageSwitch} from "@/components/i18n";

export function ErpAppHeader({module}:{module:string}){
 return <header className="erp-header erp-app-header">
  <Link href="/master-data" className="erp-brand-block" aria-label="ST Planning Master Data">
   <span className="erp-brand-mark" aria-hidden="true">ST</span>
   <div className="erp-brand-copy">
    <h1>{ERP_UI_CONFIG.productName}</h1>
    <small>{ERP_UI_CONFIG.productArea}</small>
   </div>
  </Link>
  <div className="erp-header-context" aria-label="Application context">
   <div className="erp-header-module"><small>WORKSPACE</small><strong>{module}</strong></div>
   <LanguageSwitch/>
   <span className="erp-env">{ERP_UI_CONFIG.defaultEnvironment}</span>
  </div>
 </header>;
}
