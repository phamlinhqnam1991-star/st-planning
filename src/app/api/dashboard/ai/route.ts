import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {dashboardAiPayload,loadDashboardData} from "@/lib/dashboard-data";

export const dynamic="force-dynamic";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v);

type ChatRole="user"|"assistant";
type ChatMessage={role:ChatRole;content:string};

function providerConfig(){
 return {
  apiKey:clean(process.env.GROQ_API_KEY),
  model:clean(process.env.GROQ_MODEL)||"openai/gpt-oss-20b",
  baseUrl:(clean(process.env.GROQ_BASE_URL)||"https://api.groq.com/openai/v1").replace(/\/$/,""),
 };
}

function extractJson(value:string){
 const text=value.trim();
 try{return JSON.parse(text);}catch{}
 const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
 if(fenced){try{return JSON.parse(fenced.trim());}catch{}}
 const start=text.indexOf("{");
 const end=text.lastIndexOf("}");
 if(start>=0&&end>start){try{return JSON.parse(text.slice(start,end+1));}catch{}}
 return null;
}

function normalizeAnalysis(raw:any){
 const source=raw?.analysis&&typeof raw.analysis==="object"?raw.analysis:raw;
 const severities=new Set(["INFO","WATCH","RISK"]);
 const healths=new Set(["GOOD","WATCH","RISK"]);
 const array=(v:unknown)=>Array.isArray(v)?v:[];
 const str=(v:unknown,max=1000)=>clean(v).slice(0,max);
 return {
  health:healths.has(clean(source?.health).toUpperCase())?clean(source.health).toUpperCase():"WATCH",
  headline:str(source?.headline,220),
  summary:str(source?.summary,1600),
  findings:array(source?.findings).slice(0,8).map((x:any)=>({
   severity:severities.has(clean(x?.severity).toUpperCase())?clean(x.severity).toUpperCase():"INFO",
   title:str(x?.title,180),
   detail:str(x?.detail,700),
  })).filter((x:any)=>x.title||x.detail),
  recommendations:array(source?.recommendations).slice(0,8).map((x:any)=>str(x,500)).filter(Boolean),
  watchlist:array(source?.watchlist).slice(0,8).map((x:any)=>str(x,300)).filter(Boolean),
  answer:str(source?.answer,1800),
 } as const;
}

function fallbackAnalysis(content:string,question:string){
 const value=clean(content).slice(0,1800);
 return {
  health:"WATCH" as const,
  headline:"Groq connected — text response received",
  summary:question?"Groq responded successfully, but the response did not match the structured dashboard JSON format.":value,
  findings:[],
  recommendations:[],
  watchlist:[],
  answer:question?value:"",
 };
}

function sanitizeHistory(value:unknown):ChatMessage[]{
 if(!Array.isArray(value))return [];
 return value.slice(-10).map((x:any)=>({
  role:clean(x?.role)==="assistant"?"assistant" as const:"user" as const,
  content:clean(x?.content).slice(0,1200),
 })).filter(x=>x.content);
}

export async function GET(){
 const denied=await requireApiUser();
 if(denied)return denied;
 const {apiKey,model,baseUrl}=providerConfig();
 if(!apiKey){
  return NextResponse.json({
   ok:true,provider:"Groq",configured:false,connected:false,model,modelAvailable:false,
   message:"GROQ_API_KEY is not configured."
  });
 }
 try{
  const response=await fetch(`${baseUrl}/models`,{
   headers:{authorization:`Bearer ${apiKey}`},
   signal:AbortSignal.timeout(10000),
   cache:"no-store",
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
   return NextResponse.json({
    ok:true,provider:"Groq",configured:true,connected:false,model,modelAvailable:false,
    message:clean(payload?.error?.message)||`Groq connection test failed (${response.status}).`
   });
  }
  const models=Array.isArray(payload?.data)?payload.data:[];
  const modelAvailable=models.some((x:any)=>clean(x?.id)===model);
  return NextResponse.json({
   ok:true,provider:"Groq",configured:true,connected:true,model,modelAvailable,
   message:modelAvailable?"Groq connected and the configured model is available.":"Groq connected, but the configured model was not found in the provider model list."
  });
 }catch(e:any){
  return NextResponse.json({
   ok:true,provider:"Groq",configured:true,connected:false,model,modelAvailable:false,
   message:e?.name==="TimeoutError"?"Groq connection test timed out.":clean(e?.message)||"Unable to connect to Groq."
  });
 }
}

export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;

 const {apiKey,model,baseUrl}=providerConfig();
 if(!apiKey){
  return NextResponse.json({
   error:"GROQ_API_KEY is not configured.",
   code:"GROQ_NOT_CONFIGURED",
   provider:"Groq",model,connected:false,
  },{status:503});
 }

 const body=await req.json().catch(()=>({}));
 const scheduleDate=clean(body.scheduleDate);
 const locale=clean(body.locale).toLowerCase()==="vi"?"vi":"en";
 const question=clean(body.question).slice(0,800);
 const history=sanitizeHistory(body.history);
 if(!validDate(scheduleDate))return NextResponse.json({error:"Invalid dashboard date"},{status:400});

 const c=await getPool().connect();
 try{
  const dashboard=await loadDashboardData(c,{scheduleDate});
  const snapshot=dashboardAiPayload(dashboard);
  const language=locale==="vi"?"Vietnamese":"English";
  const userRequest=question
   ?`Answer this dashboard question directly: ${question}`
   :"Produce the automatic operations analysis for this dashboard snapshot.";
  const system=`You are the AI operations analyst embedded in ST Planning, a Surface Treatment production planning system.
Use ONLY the supplied current dashboard snapshot as factual evidence. Conversation history is only context for the user's intent; never treat a previous assistant answer as new factual evidence.
Never invent jobs, batches, causes, capacity rules, routing, recipes, timestamps, or facts that are not present in the snapshot.
Planning, Scheduling, and Production Execution remain the source of truth. You may analyze and recommend checks/actions, but never claim that you changed any plan, batch, schedule, recipe, READY/WAIT state, or execution status.
The snapshot is intentionally limited. If the user asks for a Job/Batch/Area/fact not present in it, explicitly say that the current AI data scope does not contain enough information and state what data would be needed.
Distinguish observed facts from interpretation. If a cause cannot be proven, label it as a possible cause and state what should be checked.
Focus on: execution progress, delayed work, bottlenecks by area/resource, unscheduled backlog, READY workload, priority jobs, schedule conflicts, and 7-day trend.
When answering a question, cite the relevant numbers/names from the snapshot whenever available so the user can verify the answer.
Return concise ${language} suitable for a production dashboard.
Return JSON only with this exact shape:
{
 "health":"GOOD|WATCH|RISK",
 "headline":"short headline",
 "summary":"3-6 sentence management summary",
 "findings":[{"severity":"INFO|WATCH|RISK","title":"...","detail":"..."}],
 "recommendations":["..."],
 "watchlist":["..."],
 "answer":"direct answer to the user's question, or empty string when there is no question"
}`;

  const conversation=history.map(x=>({role:x.role,content:x.content}));
  const response=await fetch(`${baseUrl}/chat/completions`,{
   method:"POST",
   headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
   body:JSON.stringify({
    model,
    messages:[
     {role:"system",content:system},
     ...conversation,
     {role:"user",content:`${userRequest}\n\nCURRENT DASHBOARD SNAPSHOT (this is the only factual data source):\n${JSON.stringify(snapshot)}`}
    ],
    temperature:0.15,
    max_completion_tokens:1400,
   }),
   signal:AbortSignal.timeout(25000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
   return NextResponse.json({
    error:clean(payload?.error?.message)||`Groq request failed (${response.status})`,
    provider:"Groq",model,connected:response.status!==401&&response.status!==403,
   },{status:502});
  }

  const content=clean(payload?.choices?.[0]?.message?.content);
  const parsed=extractJson(content);
  const baseAnalysis=parsed?normalizeAnalysis(parsed):fallbackAnalysis(content,question);
  const analysis=question&&!baseAnalysis.answer?{...baseAnalysis,answer:baseAnalysis.summary||content}:baseAnalysis;
  return NextResponse.json({
   ok:true,
   provider:"Groq",
   model,
   connected:true,
   generatedAt:new Date().toISOString(),
   format:parsed?"structured":"text_fallback",
   warning:parsed?"":"Groq is connected, but this response did not match the structured dashboard JSON format. The text response is shown instead.",
   analysis,
  });
 }catch(e:any){
  const message=e?.name==="TimeoutError"?"Groq analysis timed out.":clean(e?.message)||"Dashboard AI analysis failed.";
  return NextResponse.json({error:message,provider:"Groq",model,connected:false},{status:500});
 }finally{c.release();}
}
