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

type ToolAudit={tool:string;summary:string;tables:string[];rows:number};
type DataAccess={
 mode?:string;
 knowledgeVersion?:string;
 publicSchemaAccess?:boolean;
 arbitrarySql?:boolean;
 writeAccess?:boolean;
 toolRounds?:number;
 toolsUsed?:ToolAudit[];
 totalRowsInspected?:number;
};

type ProviderStatus={provider:string;configured:boolean;connected:boolean;model:string;modelAvailable:boolean;message:string};
type AiResponse={
 ok?:boolean;provider?:string;model?:string;providerChain?:string;fallbackUsed?:boolean;generatedAt?:string;connected?:boolean;
 format?:"structured"|"text_fallback";warning?:string;analysis?:AiAnalysis;error?:string;code?:string;
 dataAccess?:DataAccess;
};

type ConnectionResponse={
 ok?:boolean;provider?:string;configured?:boolean;connected?:boolean;model?:string;modelAvailable?:boolean;message?:string;
 providerChain?:string;primaryProvider?:string;fallbackProvider?:string;providers?:ProviderStatus[];
 accessMode?:string;knowledgeVersion?:string;maxToolRounds?:number;toolNames?:string[];toolUseAvailable?:boolean;
};

type ChatTurn={id:string;role:"user"|"assistant";content:string;dataAccess?:DataAccess;provider?:string};
type ConnectionState={state:"checking"|"connected"|"disconnected"|"not-configured";message:string;modelAvailable:boolean|null};

const healthClass=(health?:string)=>health==="RISK"?"risk":health==="GOOD"?"good":"watch";
const turnId=()=>`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

function AccessEvidence({access,text}:{access:DataAccess|null|undefined;text:(en:string,vi:string)=>string}){
 const tools=access?.toolsUsed||[];
 if(!access)return null;
 return <div className="dashboard-ai-evidence">
  <b>{text("Data used for this answer","Dữ liệu đã dùng cho câu trả lời này")}</b>
  {tools.length?<>
   <div className="dashboard-ai-evidence-tags">{tools.map((x,i)=><span key={`${x.tool}-${i}`} title={x.tables.join(" · ")}>{x.tool} · {x.rows} {text("rows","dòng")}</span>)}</div>
   <small>{text("Tables inspected","Bảng đã đọc")}: {[...new Set(tools.flatMap(x=>x.tables))].join(" · ")||"—"}</small>
  </>:<small>{text("Dashboard snapshot only — no additional database tool was needed.","Chỉ dùng snapshot Dashboard — không cần đọc thêm database.")}</small>}
 </div>;
}

export function DashboardAiPanel({scheduleDate,scope}:{scheduleDate:string;scope:DashboardAiScope}){
 const {locale,text}=useUiLanguage();
 const [analysis,setAnalysis]=useState<AiAnalysis|null>(null);
 const [provider,setProvider]=useState("Groq");const [model,setModel]=useState("");
 const [providerChain,setProviderChain]=useState("Groq → OpenRouter");const [fallbackUsed,setFallbackUsed]=useState(false);
 const [error,setError]=useState("");const [warning,setWarning]=useState("");
 const [busy,setBusy]=useState(false);const [connectionBusy,setConnectionBusy]=useState(false);
 const [question,setQuestion]=useState("");const [chat,setChat]=useState<ChatTurn[]>([]);
 const [lastAccess,setLastAccess]=useState<DataAccess|null>(null);
 const [connection,setConnection]=useState<ConnectionState>({state:"checking",message:"",modelAvailable:null});
 const [connectionInfo,setConnectionInfo]=useState<ConnectionResponse>({});

 const suggestions=useMemo(()=>[
  text("Analyze today's production and tell me what I should handle first. Use database evidence when needed.","Phân tích sản xuất hôm nay và cho tôi biết nên xử lý việc gì trước. Đọc database khi cần."),
  text("Why is Painting delayed today? Check the related batches, resources and jobs before concluding.","Vì sao Painting hôm nay bị trễ? Kiểm tra Batch, Resource và Job liên quan trước khi kết luận."),
  text("Which priority jobs are at risk? Read their current planning/batch/schedule context.","Priority Job nào đang có rủi ro? Đọc trạng thái Planning/Batch/Schedule hiện tại của chúng."),
  text("Explain the current status of a Job I give you, including routing, Planning Chain, Batch and Schedule.","Giải thích trạng thái hiện tại của một Job tôi đưa, gồm routing, Planning Chain, Batch và Schedule."),
  text("Which resources are overloaded or underused today? Prove it with database data.","Resource nào đang quá tải hoặc ít tải hôm nay? Chứng minh bằng dữ liệu database."),
 ],[text]);

 const testConnection=useCallback(async()=>{
  setConnectionBusy(true);setConnection(prev=>({...prev,state:"checking"}));
  try{
   const r=await fetch("/api/dashboard/ai",{method:"GET",cache:"no-store"});
   const d=await safeJson(r) as ConnectionResponse;setConnectionInfo(d||{});
   if(d?.provider)setProvider(d.provider);if(d?.model)setModel(d.model);if(d?.providerChain)setProviderChain(d.providerChain);
   if(!d?.configured)setConnection({state:"not-configured",message:d?.message||"No AI provider is configured.",modelAvailable:false});
   else if(d?.connected)setConnection({state:"connected",message:d?.message||"AI provider connected.",modelAvailable:d?.modelAvailable??null});
   else setConnection({state:"disconnected",message:d?.message||"Unable to connect to an AI provider.",modelAvailable:d?.modelAvailable??false});
  }catch(e){setConnection({state:"disconnected",message:e instanceof Error?e.message:String(e),modelAvailable:false});}
  finally{setConnectionBusy(false);}
 },[]);

 const run=useCallback(async(q="",history:ChatTurn[]=[]):Promise<AiResponse|null>=>{
  setBusy(true);setError("");setWarning("");
  try{
   const r=await fetch("/api/dashboard/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    scheduleDate,locale,question:q,history:history.map(x=>({role:x.role,content:x.content}))
   })});
   const d=await safeJson(r) as AiResponse;
   if(d?.provider)setProvider(d.provider);if(d?.model)setModel(d.model);if(d?.providerChain)setProviderChain(d.providerChain);setFallbackUsed(Boolean(d?.fallbackUsed));
   if(d?.connected===true)setConnection(prev=>({state:"connected",message:prev.message||"AI provider connected.",modelAvailable:prev.modelAvailable}));
   if(d?.connected===false&&r.status!==429)setConnection(prev=>({state:prev.state==="not-configured"?"not-configured":"disconnected",message:d?.error||prev.message,modelAvailable:prev.modelAvailable}));
   if(!r.ok)throw new Error(d?.error||text("Unable to analyze dashboard.","Không thể phân tích Dashboard."));
   if(d?.analysis)setAnalysis(d.analysis);if(d?.warning)setWarning(d.warning);setLastAccess(d?.dataAccess||null);
   return d;
  }catch(e){setError(e instanceof Error?e.message:String(e));return null;}
  finally{setBusy(false);}
 },[locale,scheduleDate,text]);

 useEffect(()=>{void testConnection();},[testConnection]);
 useEffect(()=>{void run();},[run]);
 useEffect(()=>{setChat([]);setQuestion("");setLastAccess(null);},[scheduleDate]);

 async function ask(){
  const q=question.trim();if(!q||busy)return;
  const history=chat.slice(-10);const userTurn:ChatTurn={id:turnId(),role:"user",content:q};
  setQuestion("");setChat(prev=>[...prev,userTurn]);
  const result=await run(q,history);
  if(result?.analysis){
   const answer=result.analysis.answer||result.analysis.summary||text("AI returned no answer.","AI không trả về câu trả lời.");
   setChat(prev=>[...prev,{id:turnId(),role:"assistant",content:answer,dataAccess:result.dataAccess,provider:result.provider||"AI"}]);
  }else setChat(prev=>[...prev,{id:turnId(),role:"assistant",content:text("I could not answer because the AI request failed. Check the connection/error message above.","Không thể trả lời vì yêu cầu AI bị lỗi. Hãy kiểm tra trạng thái kết nối/lỗi phía trên.")}]);
 }

 const connectionLabel=connection.state==="connected"?text("Connected","Đã kết nối"):connection.state==="not-configured"?text("Not configured","Chưa cấu hình"):connection.state==="checking"?text("Checking...","Đang kiểm tra..."):text("Disconnected","Mất kết nối");

 return <section className="dashboard-ai-panel">
  <div className="dashboard-ai-head">
   <div><span className="dashboard-ai-kicker">AI OPERATIONS ANALYST</span><h3>{text("AI Analysis","Phân tích AI")}</h3><small>{providerChain} · {model?`${provider} · ${model}`:provider} · {text("read-only database agent","AI Agent đọc database, không ghi dữ liệu")}</small></div>
   <div className="dashboard-ai-actions">
    <span className={`dashboard-ai-connection ${connection.state}`} title={connection.message}><i></i>{connectionLabel}</span>
    <button className="btn small" type="button" disabled={connectionBusy} onClick={()=>void testConnection()}>{connectionBusy?text("Testing...","Đang kiểm tra..."):text("Test connection","Kiểm tra kết nối")}</button>
    {fallbackUsed?<span className="dashboard-ai-fallback">OpenRouter fallback</span>:null}
    {analysis?<span className={`dashboard-ai-health ${healthClass(analysis.health)}`}>{analysis.health}</span>:null}
    <button className="btn small" type="button" disabled={busy} onClick={()=>void run()}>{busy?text("Analyzing...","Đang phân tích..."):text("Refresh AI","Phân tích lại")}</button>
   </div>
  </div>

  <div className="dashboard-ai-connection-detail">
   <b>{text("Connection","Kết nối")}:</b><span>{connection.message||connectionLabel}</span>
   {connection.state==="connected"?<small>{text("Database access: public application schema · READ ONLY · safe tools · no arbitrary SQL · no write access.","Quyền database: schema ứng dụng public · CHỈ ĐỌC · qua tool an toàn · không SQL tự do · không quyền ghi.")}{connectionInfo.knowledgeVersion?` · Logic ${connectionInfo.knowledgeVersion}`:""}</small>:null}
   {connectionInfo.providers?.length?<div className="dashboard-ai-provider-status">{connectionInfo.providers.map(x=><span key={x.provider} className={x.connected?"connected":x.configured?"disconnected":"not-configured"} title={x.message}><b>{x.provider}</b> · {x.connected?text("Ready","Sẵn sàng"):x.configured?text("Unavailable","Không khả dụng"):text("Not configured","Chưa cấu hình")} · {x.model}</span>)}</div>:null}
   {connection.state==="connected"&&connection.modelAvailable===false?<small>{text("The active provider is reachable, but the configured model was not found. Check the provider model setting.","Provider đang dùng đã kết nối nhưng không tìm thấy model cấu hình. Kiểm tra cấu hình model của provider.")}</small>:null}
  </div>

  <details className="dashboard-ai-scope">
   <summary><span>{text("AI data access — what providers can read","Quyền dữ liệu AI — provider có thể đọc gì")}</span><small>{text("Snapshot + database tools","Snapshot + tool database")}</small></summary>
   <div className="dashboard-ai-scope-body">
    <div className="dashboard-ai-access-grid">
     <article><b>{text("Database scope","Phạm vi database")}</b><span>public.*</span><p>{text("All application tables/views in the public schema can be discovered and read on demand.","Có thể khám phá và đọc theo nhu cầu tất cả bảng/view ứng dụng trong schema public.")}</p></article>
     <article><b>{text("Access mode","Chế độ truy cập")}</b><span>READ ONLY</span><p>{text("Safe structured SELECT/aggregate tools only; the model cannot execute arbitrary SQL.","Chỉ dùng tool SELECT/aggregate có kiểm soát; model không được chạy SQL tự do.")}</p></article>
     <article><b>{text("Business logic","Logic nghiệp vụ")}</b><span>{connectionInfo.knowledgeVersion||"V371"}</span><p>{text("Canonical Planning Chain, NextOperation, Recipe/Batch, Scheduling, Chemical/Paint, Masking/Unmasking and Execution rules are supplied to the agent.","Agent được cung cấp logic chuẩn Planning Chain, NextOperation, Recipe/Batch, Scheduling, Chemical/Paint, Masking/Unmasking và Execution.")}</p></article>
     <article><b>{text("Free-quota protection","Bảo vệ quota miễn phí")}</b><span>{connectionInfo.maxToolRounds||4} {text("tool rounds max","vòng tool tối đa")}</span><p>{text("AI does not dump the entire database into every prompt. It reads only the rows needed for the question.","AI không đổ toàn bộ database vào mỗi prompt; chỉ đọc dữ liệu cần cho câu hỏi.")}</p></article>
    </div>
    <p><b>{text("Always available first","Luôn có sẵn trước")}:</b> {text("the structured Dashboard snapshot below. When you Ask AI about a specific Job, Batch, routing, recipe, area, resource or configuration, the active AI provider can call the same read-only database tools for additional evidence.","snapshot Dashboard có cấu trúc bên dưới. Khi bạn hỏi Job, Batch, routing, recipe, area, resource hoặc cấu hình cụ thể, provider AI đang hoạt động có thể gọi cùng bộ tool database chỉ đọc để lấy thêm bằng chứng.")}</p>
    <div className="dashboard-ai-scope-grid">{scope.sections.map(section=><article key={section.key}><div><b>{section.label}</b><span>{section.rows}{section.limit?` / max ${section.limit}`:""}</span></div><p>{section.description}</p><small>{section.fields.join(" · ")}</small></article>)}</div>
    <div className="dashboard-ai-not-in-scope"><b>{text("AI is NOT allowed to do","AI KHÔNG được phép")}</b><ul>{scope.notIncluded.map((x,i)=><li key={i}>{x}</li>)}</ul></div>
   </div>
  </details>

  <div className="dashboard-ai-suggestions"><b>{text("Suggested questions","Câu hỏi gợi ý")}</b><div>{suggestions.map((x,i)=><button type="button" key={i} onClick={()=>setQuestion(x)}>{x}</button>)}</div></div>

  {busy&&!analysis?<div className="dashboard-ai-loading"><b>{text("AI is analyzing ST Planning data...","AI đang phân tích dữ liệu ST Planning...")}</b><span>{text("The agent may read additional database rows when your question requires them.","Agent có thể đọc thêm dữ liệu database nếu câu hỏi cần.")}</span></div>:null}
  {error?<div className="dashboard-ai-error"><b>{text("AI analysis unavailable","Chưa dùng được AI Analysis")}</b><span>{error}</span>{error.includes("API_KEY")||error.includes("provider is configured")?<small>{text("Configure GROQ_API_KEY and/or OPENROUTER_API_KEY in Vercel Environment Variables, then redeploy.","Cấu hình GROQ_API_KEY và/hoặc OPENROUTER_API_KEY trong Vercel Environment Variables rồi redeploy.")}</small>:null}</div>:null}
  {warning?<div className="dashboard-ai-warning"><b>{text("AI provider is connected","Provider AI đã kết nối")}</b><span>{warning}</span></div>:null}

  {analysis?<div className="dashboard-ai-body">
   <div className="dashboard-ai-summary"><b>{analysis.headline||text("Operations summary","Tổng quan vận hành")}</b><p>{analysis.summary}</p></div>
   <AccessEvidence access={lastAccess} text={text}/>
   {analysis.findings.length?<div className="dashboard-ai-section"><h4>{text("What AI sees","AI đang thấy gì")}</h4><div className="dashboard-ai-findings">{analysis.findings.map((x,i)=><article className={`dashboard-ai-finding ${healthClass(x.severity)}`} key={`${x.title}-${i}`}><span>{x.severity}</span><div><b>{x.title}</b><p>{x.detail}</p></div></article>)}</div></div>:null}
   {analysis.recommendations.length?<div className="dashboard-ai-section"><h4>{text("Recommended checks / actions","Đề xuất kiểm tra / hành động")}</h4><ol className="dashboard-ai-list">{analysis.recommendations.map((x,i)=><li key={i}>{x}</li>)}</ol></div>:null}
   {analysis.watchlist.length?<div className="dashboard-ai-section"><h4>{text("Watchlist","Cần theo dõi")}</h4><div className="dashboard-ai-watchlist">{analysis.watchlist.map((x,i)=><span key={i}>{x}</span>)}</div></div>:null}
  </div>:null}

  <div className="dashboard-ai-chat-head"><div><b>{text("AI conversation","Hội thoại AI")}</b><small>{text("Follow-up questions keep conversation context. Database facts are re-read through the current snapshot/read-only tools when needed.","Câu hỏi tiếp theo giữ ngữ cảnh hội thoại. Dữ kiện database được đọc lại từ snapshot/tool chỉ đọc khi cần.")}</small></div>{chat.length?<button type="button" className="btn small" disabled={busy} onClick={()=>setChat([])}>{text("Clear chat","Xóa hội thoại")}</button>:null}</div>
  {chat.length?<div className="dashboard-ai-chat">{chat.map(turn=><div className={`dashboard-ai-chat-turn ${turn.role}`} key={turn.id}><b>{turn.role==="user"?text("You","Bạn"):(turn.provider||"AI")}</b><p>{turn.content}</p>{turn.role==="assistant"&&turn.dataAccess?<AccessEvidence access={turn.dataAccess} text={text}/>:null}</div>)}{busy?<div className="dashboard-ai-chat-turn assistant pending"><b>{provider||"AI"}</b><p>{text("Reading / analyzing...","Đang đọc / phân tích...")}</p></div>:null}</div>:<div className="dashboard-ai-chat-empty">{text("No conversation yet. Ask about a Job, Batch, Area, Resource, routing, recipe, schedule, production status or business logic.","Chưa có hội thoại. Có thể hỏi về Job, Batch, Area, Resource, routing, recipe, schedule, production status hoặc logic nghiệp vụ.")}</div>}

  <div className="dashboard-ai-ask"><input className="input" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void ask();}}} placeholder={text("Ask AI about any ST Planning data or logic...","Hỏi AI về bất kỳ dữ liệu hoặc logic ST Planning...")}/><button className="btn primary" type="button" disabled={busy||!question.trim()} onClick={()=>void ask()}>{text("Ask AI","Hỏi AI")}</button></div>
 </section>;
}
