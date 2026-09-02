"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {useUiLanguage} from "@/components/i18n/ui-language-provider";
import {safeJson} from "@/lib/fetch-json";
import type {DashboardAiScope} from "@/lib/dashboard-data";

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
 connected?:boolean;
 format?:"structured"|"text_fallback";
 warning?:string;
 analysis?:AiAnalysis;
 error?:string;
 code?:string;
};

type ConnectionResponse={
 ok?:boolean;
 provider?:string;
 configured?:boolean;
 connected?:boolean;
 model?:string;
 modelAvailable?:boolean;
 message?:string;
};

type ChatTurn={id:string;role:"user"|"assistant";content:string};
type ConnectionState={state:"checking"|"connected"|"disconnected"|"not-configured";message:string;modelAvailable:boolean|null};

const healthClass=(health?:string)=>health==="RISK"?"risk":health==="GOOD"?"good":"watch";
const turnId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

export function DashboardAiPanel({scheduleDate,scope}:{scheduleDate:string;scope:DashboardAiScope}){
 const {locale,text}=useUiLanguage();
 const [analysis,setAnalysis]=useState<AiAnalysis|null>(null);
 const [provider,setProvider]=useState("Groq");
 const [model,setModel]=useState("");
 const [error,setError]=useState("");
 const [warning,setWarning]=useState("");
 const [busy,setBusy]=useState(false);
 const [connectionBusy,setConnectionBusy]=useState(false);
 const [question,setQuestion]=useState("");
 const [chat,setChat]=useState<ChatTurn[]>([]);
 const [connection,setConnection]=useState<ConnectionState>({state:"checking",message:"",modelAvailable:null});

 const suggestions=useMemo(()=>[
  text("Which area is the biggest bottleneck today? Prove it with the dashboard numbers.","Khu vực nào đang là bottleneck lớn nhất hôm nay? Chứng minh bằng số liệu Dashboard."),
  text("Which batches are delayed and what should I check first?","Batch nào đang trễ và tôi nên kiểm tra gì trước?"),
  text("Which resource has the highest scheduled load today?","Resource nào có tải điều độ cao nhất hôm nay?"),
  text("Where is the READY backlog concentrated?","READY backlog đang tập trung ở đâu?"),
  text("Are there priority jobs at risk? List only what you can verify from the snapshot.","Có Priority Job nào đang có rủi ro không? Chỉ liệt kê những gì xác minh được từ snapshot."),
 ],[text]);

 const testConnection=useCallback(async()=>{
  setConnectionBusy(true);
  setConnection(prev=>({...prev,state:"checking"}));
  try{
   const r=await fetch("/api/dashboard/ai",{method:"GET",cache:"no-store"});
   const d=await safeJson(r) as ConnectionResponse;
   if(d?.provider)setProvider(d.provider);
   if(d?.model)setModel(d.model);
   if(!d?.configured){
    setConnection({state:"not-configured",message:d?.message||"GROQ_API_KEY is not configured.",modelAvailable:false});
   }else if(d?.connected){
    setConnection({state:"connected",message:d?.message||"Groq connected.",modelAvailable:d?.modelAvailable??null});
   }else{
    setConnection({state:"disconnected",message:d?.message||"Unable to connect to Groq.",modelAvailable:d?.modelAvailable??false});
   }
  }catch(e){
   setConnection({state:"disconnected",message:e instanceof Error?e.message:String(e),modelAvailable:false});
  }finally{setConnectionBusy(false);}
 },[]);

 const run=useCallback(async(q="",history:ChatTurn[]=[]):Promise<AiResponse|null>=>{
  setBusy(true);setError("");setWarning("");
  try{
   const r=await fetch("/api/dashboard/ai",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
     scheduleDate,locale,question:q,
     history:history.map(x=>({role:x.role,content:x.content}))
    })
   });
   const d=await safeJson(r) as AiResponse;
   if(d?.provider)setProvider(d.provider);
   if(d?.model)setModel(d.model);
   if(d?.connected===true)setConnection(prev=>({state:"connected",message:prev.message||"Groq connected.",modelAvailable:prev.modelAvailable}));
   if(d?.connected===false&&r.status!==429)setConnection(prev=>({state:prev.state==="not-configured"?"not-configured":"disconnected",message:d?.error||prev.message,modelAvailable:prev.modelAvailable}));
   if(!r.ok)throw new Error(d?.error||text("Unable to analyze dashboard.","Không thể phân tích Dashboard."));
   if(d?.analysis)setAnalysis(d.analysis);
   if(d?.warning)setWarning(d.warning);
   return d;
  }catch(e){
   setError(e instanceof Error?e.message:String(e));
   return null;
  }finally{setBusy(false);}
 },[locale,scheduleDate,text]);

 useEffect(()=>{void testConnection();},[testConnection]);
 useEffect(()=>{void run();},[run]);
 useEffect(()=>{setChat([]);setQuestion("");},[scheduleDate]);

 async function ask(){
  const q=question.trim();if(!q||busy)return;
  const history=chat.slice(-10);
  const userTurn:ChatTurn={id:turnId(),role:"user",content:q};
  setQuestion("");
  setChat(prev=>[...prev,userTurn]);
  const result=await run(q,history);
  if(result?.analysis){
   const answer=result.analysis.answer||result.analysis.summary||text("Groq returned no answer.","Groq không trả về câu trả lời.");
   setChat(prev=>[...prev,{id:turnId(),role:"assistant",content:answer}]);
  }else{
   setChat(prev=>[...prev,{id:turnId(),role:"assistant",content:text("I could not answer because the AI request failed. Check the connection/error message above.","Không thể trả lời vì yêu cầu AI bị lỗi. Hãy kiểm tra trạng thái kết nối/lỗi phía trên.")}]);
  }
 }

 const connectionLabel=connection.state==="connected"
  ?text("Connected","Đã kết nối")
  :connection.state==="not-configured"
   ?text("Not configured","Chưa cấu hình")
   :connection.state==="checking"
    ?text("Checking...","Đang kiểm tra...")
    :text("Disconnected","Mất kết nối");

 return <section className="dashboard-ai-panel">
  <div className="dashboard-ai-head">
   <div>
    <span className="dashboard-ai-kicker">AI OPERATIONS ANALYST</span>
    <h3>{text("Groq Analysis","Phân tích Groq")}</h3>
    <small>{model?`${provider} · ${model}`:provider} · {text("read-only analysis","chỉ phân tích, không ghi dữ liệu")}</small>
   </div>
   <div className="dashboard-ai-actions">
    <span className={`dashboard-ai-connection ${connection.state}`} title={connection.message}><i></i>{connectionLabel}</span>
    <button className="btn small" type="button" disabled={connectionBusy} onClick={()=>void testConnection()}>{connectionBusy?text("Testing...","Đang kiểm tra..."):text("Test connection","Kiểm tra kết nối")}</button>
    {analysis?<span className={`dashboard-ai-health ${healthClass(analysis.health)}`}>{analysis.health}</span>:null}
    <button className="btn small" type="button" disabled={busy} onClick={()=>void run()}>{busy?text("Analyzing...","Đang phân tích..."):text("Refresh AI","Phân tích lại")}</button>
   </div>
  </div>

  <div className="dashboard-ai-connection-detail">
   <b>{text("Connection","Kết nối")}:</b><span>{connection.message||connectionLabel}</span>
   {connection.state==="connected"&&connection.modelAvailable===false?<small>{text("Provider is reachable, but the configured model was not found. Check GROQ_MODEL.","Đã kết nối provider nhưng không tìm thấy model cấu hình. Kiểm tra GROQ_MODEL.")}</small>:null}
  </div>

  <details className="dashboard-ai-scope">
   <summary><span>{text("AI data scope — what Groq can see","Phạm vi dữ liệu AI — Groq có thể xem gì")}</span><small>{scope.sections.reduce((n,x)=>n+x.rows,0)} {text("snapshot rows/sections","dòng/nhóm snapshot")}</small></summary>
   <div className="dashboard-ai-scope-body">
    <p>{text("Groq does not see the whole database. It only receives the structured snapshot below for the selected production day. Ask questions that can be proven from these fields.","Groq không xem toàn bộ database. AI chỉ nhận snapshot có cấu trúc bên dưới của ngày sản xuất đang chọn. Nên hỏi những câu có thể chứng minh từ các trường này.")}</p>
    <div className="dashboard-ai-scope-grid">{scope.sections.map(section=><article key={section.key}>
     <div><b>{section.label}</b><span>{section.rows}{section.limit?` / max ${section.limit}`:""}</span></div>
     <p>{section.description}</p>
     <small>{section.fields.join(" · ")}</small>
    </article>)}</div>
    <div className="dashboard-ai-not-in-scope"><b>{text("Not sent to Groq","Không gửi cho Groq")}</b><ul>{scope.notIncluded.map((x,i)=><li key={i}>{x}</li>)}</ul></div>
   </div>
  </details>

  <div className="dashboard-ai-suggestions">
   <b>{text("Suggested questions","Câu hỏi gợi ý")}</b>
   <div>{suggestions.map((x,i)=><button type="button" key={i} onClick={()=>setQuestion(x)}>{x}</button>)}</div>
  </div>

  {busy&&!analysis?<div className="dashboard-ai-loading"><b>{text("Groq is analyzing the production snapshot...","Groq đang phân tích dữ liệu sản xuất...")}</b><span>{text("KPI, delayed work, bottlenecks, priority and workload are being reviewed.","Đang xem KPI, công việc trễ, bottleneck, priority và workload.")}</span></div>:null}

  {error?<div className="dashboard-ai-error"><b>{text("AI analysis unavailable","Chưa dùng được AI Analysis")}</b><span>{error}</span>{error.includes("GROQ_API_KEY")?<small>{text("Add GROQ_API_KEY in Vercel Environment Variables, then redeploy.","Thêm GROQ_API_KEY trong Vercel Environment Variables rồi redeploy.")}</small>:null}</div>:null}
  {warning?<div className="dashboard-ai-warning"><b>{text("Groq is connected","Groq đã kết nối")}</b><span>{warning}</span></div>:null}

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

  <div className="dashboard-ai-chat-head">
   <div><b>{text("AI conversation","Hội thoại AI")}</b><small>{text("Follow-up questions keep the recent conversation context; current Dashboard snapshot remains the only factual source.","Câu hỏi tiếp theo giữ ngữ cảnh hội thoại gần đây; snapshot Dashboard hiện tại vẫn là nguồn dữ liệu thực tế duy nhất.")}</small></div>
   {chat.length?<button type="button" className="btn small" disabled={busy} onClick={()=>setChat([])}>{text("Clear chat","Xóa hội thoại")}</button>:null}
  </div>
  {chat.length?<div className="dashboard-ai-chat">{chat.map(turn=><div className={`dashboard-ai-chat-turn ${turn.role}`} key={turn.id}>
   <b>{turn.role==="user"?text("You","Bạn"):"Groq"}</b><p>{turn.content}</p>
  </div>)}{busy?<div className="dashboard-ai-chat-turn assistant pending"><b>Groq</b><p>{text("Analyzing...","Đang phân tích...")}</p></div>:null}</div>:<div className="dashboard-ai-chat-empty">{text("No conversation yet. Use a suggested question or ask your own question below.","Chưa có hội thoại. Chọn câu hỏi gợi ý hoặc nhập câu hỏi của bạn bên dưới.")}</div>}

  <div className="dashboard-ai-ask">
   <input className="input" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void ask();}}} placeholder={text("Ask Groq about today's production, bottlenecks, risks...","Hỏi Groq về sản xuất hôm nay, bottleneck, rủi ro...")}/>
   <button className="btn primary" type="button" disabled={busy||!question.trim()} onClick={()=>void ask()}>{text("Ask AI","Hỏi AI")}</button>
  </div>
 </section>;
}
