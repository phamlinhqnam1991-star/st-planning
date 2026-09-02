"use client";

import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {
 UI_DEFAULT_LOCALE,
 UI_LANGUAGE_COOKIE,
 UI_LANGUAGE_STORAGE_KEY,
 isUiLocale,
 translateUiText,
 uiPair,
 type UiLocale,
} from "@/lib/i18n/ui-language";

type UiLanguageContextValue={
 locale:UiLocale;
 setLocale:(locale:UiLocale)=>void;
 text:(en:string,vi:string)=>string;
 translate:(source:string)=>string;
};

const UiLanguageContext=createContext<UiLanguageContextValue|null>(null);
const TRANSLATABLE_ATTRIBUTES=["placeholder","title","aria-label","alt"] as const;
const SKIP_SELECTOR='[data-i18n-skip],script,style,noscript,code,pre,textarea,[contenteditable="true"],.mono';
const DATA_LIKE_SELECTOR='td,[data-i18n-data]';
const PHRASE_UI_SELECTOR=[
 "button","label","th","summary","h1","h2","h3","h4","h5","h6","p","option",
 ".erp-header",".erpkit-app-header",".erp-navigation-stack",".erpkit-navigation-stack",
 ".erp-page-head",".erp-panel-head",".erp-object-eyebrow",".erp-sidebar",".erp-subnav",
 "[class*=\"erp-config-\"]","[class*=\"guide-\"]","[class*=\"lg-\"]",
 ".erp-dialog",".app-toast",".notice",".status-chip",".planning-toolbar",".candidate-sticky-toolbar"
].join(",");

class DomUiTranslator{
 private locale:UiLocale;
 private originalText=new WeakMap<Text,string>();
 private lastText=new WeakMap<Text,string>();
 private originalAttrs=new WeakMap<Element,Map<string,string>>();
 private lastAttrs=new WeakMap<Element,Map<string,string>>();
 private observer:MutationObserver|null=null;

 constructor(locale:UiLocale){this.locale=locale;}

 setLocale(locale:UiLocale){
  this.locale=locale;
  if(typeof document!=="undefined")this.translateTree(document.body);
 }

 start(){
  if(typeof document==="undefined"||this.observer)return;
  this.translateTree(document.body);
  this.observer=new MutationObserver(records=>{
   for(const record of records){
    if(record.type==="characterData"&&record.target instanceof Text){
     const node=record.target;
     const current=node.data;
     if(current!==this.lastText.get(node))this.originalText.set(node,current);
     this.translateTextNode(node);
     continue;
    }
    if(record.type==="attributes"&&record.target instanceof Element&&record.attributeName){
     const el=record.target;
     const attr=record.attributeName;
     const current=el.getAttribute(attr)??"";
     const last=this.lastAttrs.get(el)?.get(attr);
     if(current!==last){
      let map=this.originalAttrs.get(el);if(!map){map=new Map();this.originalAttrs.set(el,map)}
      map.set(attr,current);
     }
     this.translateElementAttributes(el);
     continue;
    }
    for(const node of Array.from(record.addedNodes)){
     if(node instanceof Element||node instanceof Text)this.translateTree(node);
    }
   }
  });
  this.observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...TRANSLATABLE_ATTRIBUTES]});
 }

 stop(){this.observer?.disconnect();this.observer=null;}

 private shouldSkip(el:Element|null){return Boolean(el?.closest(SKIP_SELECTOR));}

 private translateTextNode(node:Text){
  const parent=node.parentElement;
  if(!parent||this.shouldSkip(parent)||!node.data.trim())return;
  if(!this.originalText.has(node))this.originalText.set(node,node.data);
  const source=this.originalText.get(node)??node.data;
  const exactOnly=Boolean(parent.closest(DATA_LIKE_SELECTOR))||!parent.closest(PHRASE_UI_SELECTOR);
  const next=translateUiText(source,this.locale,{exactOnly});
  this.lastText.set(node,next);
  if(node.data!==next)node.data=next;
 }

 private translateElementAttributes(el:Element){
  if(this.shouldSkip(el))return;
  let originals=this.originalAttrs.get(el);
  if(!originals){originals=new Map();this.originalAttrs.set(el,originals)}
  let lasts=this.lastAttrs.get(el);
  if(!lasts){lasts=new Map();this.lastAttrs.set(el,lasts)}
  for(const attr of TRANSLATABLE_ATTRIBUTES){
   if(!el.hasAttribute(attr))continue;
   if(!originals.has(attr))originals.set(attr,el.getAttribute(attr)??"");
   const source=originals.get(attr)??"";
   const next=translateUiText(source,this.locale);
   lasts.set(attr,next);
   if(el.getAttribute(attr)!==next)el.setAttribute(attr,next);
  }
 }

 private translateTree(root:Node){
  if(root instanceof Text){this.translateTextNode(root);return;}
  if(!(root instanceof Element))return;
  if(this.shouldSkip(root))return;
  this.translateElementAttributes(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let node=walker.nextNode();
  while(node){
   if(node instanceof Text)this.translateTextNode(node);
   else if(node instanceof Element)this.translateElementAttributes(node);
   node=walker.nextNode();
  }
 }
}

function readSavedLocale():UiLocale{
 try{
  const stored=window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  if(isUiLocale(stored))return stored;
 }catch{}
 const cookie=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${UI_LANGUAGE_COOKIE}=`));
 const value=cookie?.split("=")[1];
 return isUiLocale(value)?value:UI_DEFAULT_LOCALE;
}

export function UiLanguageProvider({children}:{children:ReactNode}){
 const [locale,setLocaleState]=useState<UiLocale>(UI_DEFAULT_LOCALE);
 const translatorRef=useRef<DomUiTranslator|null>(null);

 const setLocale=useCallback((next:UiLocale)=>{
  setLocaleState(next);
  try{window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY,next)}catch{}
  document.cookie=`${UI_LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
 },[]);

 useLayoutEffect(()=>{
  const saved=readSavedLocale();
  if(saved!==locale)setLocaleState(saved);
  // Default is EN; a previously saved preference is restored before paint where possible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 useLayoutEffect(()=>{
  document.documentElement.lang=locale;
  document.documentElement.dataset.uiLanguage=locale;
  if(!translatorRef.current){
   translatorRef.current=new DomUiTranslator(locale);
   translatorRef.current.start();
  }else translatorRef.current.setLocale(locale);
 },[locale]);

 useEffect(()=>()=>translatorRef.current?.stop(),[]);

 const value=useMemo<UiLanguageContextValue>(()=>({
  locale,
  setLocale,
  text:(en,vi)=>uiPair(locale,en,vi),
  translate:(source)=>translateUiText(source,locale),
 }),[locale,setLocale]);
 return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage(){
 const value=useContext(UiLanguageContext);
 if(!value)throw new Error("useUiLanguage must be used inside UiLanguageProvider");
 return value;
}
