import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {dashboardAiPayload,loadDashboardData} from "@/lib/dashboard-data";

export const dynamic="force-dynamic";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v);

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
 const severities=new Set(["INFO","WATCH","RISK"]);
 const healths=new Set(["GOOD","WATCH","RISK"]);
 const array=(v:unknown)=>Array.isArray(v)?v:[];
 const str=(v:unknown,max=1000)=>clean(v).slice(0,max);
 return {
  health:healths.has(clean(raw?.health).toUpperCase())?clean(raw.health).toUpperCase():"WATCH",
  headline:str(raw?.headline,220),
  summary:str(raw?.summary,1600),
  findings:array(raw?.findings).slice(0,8).map((x:any)=>({
   severity:severities.has(clean(x?.severity).toUpperCase())?clean(x.severity).toUpperCase():"INFO",
   title:str(x?.title,180),
   detail:str(x?.detail,700),
  })).filter((x:any)=>x.title||x.detail),
  recommendations:array(raw?.recommendations).slice(0,8).map((x:any)=>str(x,500)).filter(Boolean),
  watchlist:array(raw?.watchlist).slice(0,8).map((x:any)=>str(x,300)).filter(Boolean),
  answer:str(raw?.answer,1800),
 };
}

export async function POST(req:Request){
 const denied=await requireApiUser();
 if(denied)return denied;

 const apiKey=clean(process.env.GROQ_API_KEY);
 const model=clean(process.env.GROQ_MODEL)||"openai/gpt-oss-20b";
 const baseUrl=(clean(process.env.GROQ_BASE_URL)||"https://api.groq.com/openai/v1").replace(/\/$/,"");
 if(!apiKey){
  return NextResponse.json({
   error:"GROQ_API_KEY is not configured.",
   code:"GROQ_NOT_CONFIGURED",
   provider:"Groq",
   model,
  },{status:503});
 }

 const body=await req.json().catch(()=>({}));
 const scheduleDate=clean(body.scheduleDate);
 const locale=clean(body.locale).toLowerCase()==="vi"?"vi":"en";
 const question=clean(body.question).slice(0,800);
 if(!validDate(scheduleDate))return NextResponse.json({error:"Invalid dashboard date"},{status:400});

 const c=await getPool().connect();
 try{
  const dashboard=await loadDashboardData(c,{scheduleDate});
  const snapshot=dashboardAiPayload(dashboard);
  const language=locale==="vi"?"Vietnamese":"English";
  const userRequest=question
   ?`Answer this dashboard question first: ${question}`
   :"Produce the automatic operations analysis for this dashboard snapshot.";
  const system=`You are the AI operations analyst embedded in ST Planning, a Surface Treatment production planning system.
Use ONLY the supplied dashboard snapshot. Never invent jobs, batches, causes, capacity rules, or facts that are not present in the data.
Planning, Scheduling, and Production Execution remain the source of truth. You may analyze and recommend actions, but never claim that you changed any plan, batch, schedule, recipe, or execution status.
Distinguish observed facts from reasonable interpretation. If a cause cannot be proven from the snapshot, say it is a possible cause and state what should be checked.
Focus on: execution progress, delayed work, bottlenecks by area/resource, unscheduled backlog, READY workload, priority jobs, schedule conflicts, and 7-day trend.
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

  const response=await fetch(`${baseUrl}/chat/completions`,{
   method:"POST",
   headers:{"authorization":`Bearer ${apiKey}`,"content-type":"application/json"},
   body:JSON.stringify({
    model,
    messages:[
     {role:"system",content:system},
     {role:"user",content:`${userRequest}\n\nDASHBOARD SNAPSHOT:\n${JSON.stringify(snapshot)}`}
    ],
    temperature:0.2,
    max_completion_tokens:1400,
   }),
   signal:AbortSignal.timeout(25000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){
   return NextResponse.json({
    error:clean(payload?.error?.message)||`Groq request failed (${response.status})`,
    provider:"Groq",model
   },{status:502});
  }
  const content=clean(payload?.choices?.[0]?.message?.content);
  const parsed=extractJson(content);
  if(!parsed){
   return NextResponse.json({error:"Groq returned an invalid analysis format.",provider:"Groq",model},{status:502});
  }
  return NextResponse.json({
   ok:true,
   provider:"Groq",
   model,
   generatedAt:new Date().toISOString(),
   analysis:normalizeAnalysis(parsed),
  });
 }catch(e:any){
  const message=e?.name==="TimeoutError"?"Groq analysis timed out.":clean(e?.message)||"Dashboard AI analysis failed.";
  return NextResponse.json({error:message,provider:"Groq",model},{status:500});
 }finally{c.release();}
}
