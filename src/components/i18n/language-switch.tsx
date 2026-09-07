"use client";

import {useUiLanguage} from "./ui-language-provider";

export function LanguageSwitch(){
 const {locale,setLocale}=useUiLanguage();
 return <div className="erp-language-switch" data-i18n-skip role="group" aria-label={locale==="en"?"Interface language":"Ngôn ngữ giao diện"}>
  <button type="button" className={locale==="en"?"active":""} aria-pressed={locale==="en"} onClick={()=>setLocale("en")}>EN</button>
  <button type="button" className={locale==="vi"?"active":""} aria-pressed={locale==="vi"} onClick={()=>setLocale("vi")}>VI</button>
 </div>;
}
