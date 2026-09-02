"use client";

import {useCallback,useEffect,useState} from "react";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";
import {safeJson} from "@/lib/fetch-json";

type AiFinding={severity:"INFO"|"WATCH"|"RISK";title:string;detail:string};
type AiAnalysis={
 health:"GOOD"|"WATCH"|"RISK";
 headline:string;
 summary:string;
 findings:AiFinding[];
 recommendations:string[];
 watchlist:string[];
 answer:string;
};

type AiResponse={
 ok?:boolean;
 provider?:string;
 model?:string;
 generatedAt?:string;
 analysis?:AiAnalysis;
 error?:string;
 code?:string;
};

const healthClass=(health?:string)=>health==="RISK"?"risk":health==="GOOD"?"good":"watch";

export function DashboardAiPanel({scheduleDate}:{scheduleDate:string}){
 const {locale,text}=useUiLanguage();
 const [analysis,setAnalysis]=useState<AiAnalysis|null>(null);
 const [provider,setProvider]=useState("Groq");
 const [model,setModel]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [question,setQuestion]=useState("");
 const [lastAnswer,setLastAnswer]=useState("");

 const run=useCallback(async(q="")=>{
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/dashboard/ai",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({scheduleDate,locale,question:q})
   });
   const d=await safeJson(r) as AiResponse;
   if(d?.provider)setProvider(d.provider);
   if(d?.model)setModel(d.model);
   if(!r.ok)throw new Error(d?.error||text("Unable to analyze dashboard.","Không thể phân tích Dashboard."));
   if(d?.analysis){
    setAnalysis(d.analysis);
    if(q)setLastAnswer(d.analysis.answer||d.analysis.summary||"");
   }
  }catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 },[locale,scheduleDate,text]);

 useEffect(()=>{void run();},[run]);

 async function ask(){
  const q=question.trim();if(!q||busy)return;
  await run(q);
 }

 return <section className="dashboard-ai-panel">
  <div className="dashboard-ai-head">
   <div>
    <span className="dashboard-ai-kicker">AI OPERATIONS ANALYST</span>
    <h3>{text("Groq Analysis","Phân tích Groq")}</h3>
    <small>{model?`${provider} · ${model}`:provider} · {text("read-only analysis","chỉ phân tích, không ghi dữ liệu")}</small>
   </div>
   <div className="dashboard-ai-actions">
    {analysis?<span className={`dashboard-ai-health ${healthClass(analysis.health)}`}>{analysis.health}</span>:null}
    <button className="btn small" type="button" disabled={busy} onClick={()=>run()}>{busy?text("Analyzing...","Đang phân tích..."):text("Refresh AI","Phân tích lại")}</button>
   </div>
  </div>

  {busy&&!analysis?<div className="dashboard-ai-loading"><b>{text("Groq is analyzing the production snapshot...","Groq đang phân tích dữ liệu sản xuất...")}</b><span>{text("KPI, delayed work, bottlenecks, priority and workload are being reviewed.","Đang xem KPI, công việc trễ, bottleneck, priority và workload.")}</span></div>:null}

  {error?<div className="dashboard-ai-error"><b>{text("AI analysis unavailable","Chưa dùng được AI Analysis")}</b><span>{error}</span>{error.includes("GROQ_API_KEY")?<small>{text("Add GROQ_API_KEY in Vercel Environment Variables, then redeploy.","Thêm GROQ_API_KEY trong Vercel Environment Variables rồi redeploy.")}</small>:null}</div>:null}

  {analysis?<div className="dashboard-ai-body">
   <div className="dashboard-ai-summary">
    <b>{analysis.headline||text("Operations summary","Tổng quan vận hành")}</b>
    <p>{analysis.summary}</p>
   </div>

   {analysis.findings.length?<div className="dashboard-ai-section">
    <h4>{text("What AI sees","AI đang thấy gì")}</h4>
    <div className="dashboard-ai-findings">{analysis.findings.map((x,i)=><article className={`dashboard-ai-finding ${healthClass(x.severity)}`} key={`${x.title}-${i}`}>
     <span>{x.severity}</span><div><b>{x.title}</b><p>{x.detail}</p></div>
    </article>)}</div>
   </div>:null}

   {analysis.recommendations.length?<div className="dashboard-ai-section">
    <h4>{text("Recommended checks / actions","Đề xuất kiểm tra / hành động")}</h4>
    <ol className="dashboard-ai-list">{analysis.recommendations.map((x,i)=><li key={i}>{x}</li>)}</ol>
   </div>:null}

   {analysis.watchlist.length?<div className="dashboard-ai-section">
    <h4>{text("Watchlist","Cần theo dõi")}</h4>
    <div className="dashboard-ai-watchlist">{analysis.watchlist.map((x,i)=><span key={i}>{x}</span>)}</div>
   </div>:null}
  </div>:null}

  <div className="dashboard-ai-ask">
   <input className="input" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void ask();}} placeholder={text("Ask Groq about today's production, bottlenecks, risks...","Hỏi Groq về sản xuất hôm nay, bottleneck, rủi ro...")}/>
   <button className="btn primary" type="button" disabled={busy||!question.trim()} onClick={ask}>{text("Ask AI","Hỏi AI")}</button>
  </div>
  {lastAnswer?<div className="dashboard-ai-answer"><b>{text("AI answer","AI trả lời")}</b><p>{lastAnswer}</p></div>:null}
 </section>;
}
