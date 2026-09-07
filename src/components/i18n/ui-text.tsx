"use client";

import {useUiLanguage} from "./ui-language-provider";

export function UiText({en,vi}:{en:string;vi:string}){
 const {text}=useUiLanguage();
 return <>{text(en,vi)}</>;
}
