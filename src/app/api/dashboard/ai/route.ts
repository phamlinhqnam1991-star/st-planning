import {NextResponse} from "next/server";
import {getPool} from "@/lib/db";
import {requireApiUser} from "@/lib/api-auth";
import {dashboardAiPayload,loadDashboardData} from "@/lib/dashboard-data";
import {GROQ_READ_ONLY_TOOLS,compactToolContent,executeGroqReadOnlyTool,type AiToolAudit} from "@/lib/ai/read-only-db-tools";
import {ST_AI_KNOWLEDGE_VERSION,ST_AI_SYSTEM_KNOWLEDGE} from "@/lib/ai/st-planning-knowledge";

export const dynamic="force-dynamic";

const clean=(v:unknown)=>String(v??"").trim();
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v);

type ChatRole="user"|"assistant";
type ChatMessage={role:ChatRole;content:string};
type GroqMessage={role:string;content?:string|null;tool_calls?:any[];tool_call_id?:string};

function providerConfig(){
 return {
  apiKey:clean(process.env.GROQ_API_KEY),
  model:clean(process.env.GROQ_MODEL)||"openai/gpt-oss-20b",
  baseUrl:(clean(process.env.GROQ_BASE_URL)||"https://api.groq.com/openai/v1").replace(/\/$/,""),
  maxToolRounds:Math.max(1,Math.min(6,Number(process.env.GROQ_AI_MAX_TOOL_ROUNDS)||4)),
 };
}

function extractJson(value:string){
 const text=value.trim();
 try{return JSON.parse(text);}catch{}
 const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
 if(fenced){try{return JSON.parse(fenced.trim());}catch{}}
 const start=text.indexOf("{");const end=text.lastIndexOf("}");
 if(start>=0&&end>start){try{return JSON.parse(text.slice(start,end+1));}catch{}}
 return null;
}

function normalizeAnalysis(raw:any){
 const source=raw?.analysis&&typeof raw.analysis==="object"?raw.analysis:raw;
 const severities=new Set(["INFO","WATCH","RISK"]);const healths=new Set(["GOOD","WATCH","RISK"]);
 const array=(v:unknown)=>Array.isArray(v)?v:[];const str=(v:unknown,max=1000)=>clean(v).slice(0,max);
 return {
  health:healths.has(clean(source?.health).toUpperCase())?clean(source.health).toUpperCase():"WATCH",
  headline:str(source?.headline,220),summary:str(source?.summary,1800),
  findings:array(source?.findings).slice(0,8).map((x:any)=>({
   severity:severities.has(clean(x?.severity).toUpperCase())?clean(x.severity).toUpperCase():"INFO",
   title:str(x?.title,180),detail:str(x?.detail,800),
  })).filter((x:any)=>x.title||x.detail),
  recommendations:array(source?.recommendations).slice(0,8).map((x:any)=>str(x,550)).filter(Boolean),
  watchlist:array(source?.watchlist).slice(0,8).map((x:any)=>str(x,320)).filter(Boolean),
  answer:str(source?.answer,2600),
 } as const;
}

function fallbackAnalysis(content:string,question:string){
 const value=clean(content).slice(0,2600);
 return {
  health:"WATCH" as const,
  headline:"Groq connected — text response received",
  summary:question?"Groq answered successfully, but the response did not match the structured dashboard format.":value,
  findings:[],recommendations:[],watchlist:[],answer:question?value:"",
 };
}

function sanitizeHistory(value:unknown):ChatMessage[]{
 if(!Array.isArray(value))return [];
 return value.slice(-10).map((x:any)=>({
  role:clean(x?.role)==="assistant"?"assistant" as const:"user" as const,
  content:clean(x?.content).slice(0,1600),
 })).filter(x=>x.content);
}

const analysisSchema={
 type:"object",
 properties:{
  health:{type:"string",enum:["GOOD","WATCH","RISK"]},
  headline:{type:"string"},summary:{type:"string"},
  findings:{type:"array",items:{type:"object",properties:{severity:{type:"string",enum:["INFO","WATCH","RISK"]},title:{type:"string"},detail:{type:"string"}},required:["severity","title","detail"],additionalProperties:false}},
  recommendations:{type:"array",items:{type:"string"}},watchlist:{type:"array",items:{type:"string"}},answer:{type:"string"},
 },
 required:["health","headline","summary","findings","recommendations","watchlist","answer"],
 additionalProperties:false,
};

async function groqCall(baseUrl:string,apiKey:string,body:Record<string,unknown>,timeout=25000){
 const response=await fetch(`${baseUrl}/chat/completions`,{
  method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
  body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),
 });
 const payload=await response.json().catch(()=>({}));
 return {response,payload};
}

export async function GET(){
 const denied=await requireApiUser();if(denied)return denied;
 const {apiKey,model,baseUrl,maxToolRounds}=providerConfig();
 if(!apiKey)return NextResponse.json({
  ok:true,provider:"Groq",configured:false,connected:false,model,modelAvailable:false,
  accessMode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,maxToolRounds,
  message:"GROQ_API_KEY is not configured."
 });
 try{
  const response=await fetch(`${baseUrl}/models`,{headers:{authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(10000),cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return NextResponse.json({
   ok:true,provider:"Groq",configured:true,connected:false,model,modelAvailable:false,
   accessMode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,maxToolRounds,
   message:clean(payload?.error?.message)||`Groq connection test failed (${response.status}).`
  });
  const models=Array.isArray(payload?.data)?payload.data:[];const modelAvailable=models.some((x:any)=>clean(x?.id)===model);
  return NextResponse.json({
   ok:true,provider:"Groq",configured:true,connected:true,model,modelAvailable,
   toolUseAvailable:modelAvailable,accessMode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,maxToolRounds,
   toolNames:GROQ_READ_ONLY_TOOLS.map(x=>x.function.name),
   message:modelAvailable?"Groq connected. The configured model is available and ST Planning read-only database tools are enabled.":"Groq connected, but the configured model was not found in the provider model list."
  });
 }catch(e:any){
  return NextResponse.json({
   ok:true,provider:"Groq",configured:true,connected:false,model,modelAvailable:false,
   accessMode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,maxToolRounds,
   message:e?.name==="TimeoutError"?"Groq connection test timed out.":clean(e?.message)||"Unable to connect to Groq."
  });
 }
}

export async function POST(req:Request){
 const denied=await requireApiUser();if(denied)return denied;
 const {apiKey,model,baseUrl,maxToolRounds}=providerConfig();
 if(!apiKey)return NextResponse.json({error:"GROQ_API_KEY is not configured.",code:"GROQ_NOT_CONFIGURED",provider:"Groq",model,connected:false},{status:503});

 const body=await req.json().catch(()=>({}));
 const scheduleDate=clean(body.scheduleDate);const locale=clean(body.locale).toLowerCase()==="vi"?"vi":"en";
 const question=clean(body.question).slice(0,1000);const history=sanitizeHistory(body.history);
 if(!validDate(scheduleDate))return NextResponse.json({error:"Invalid dashboard date"},{status:400});

 const c=await getPool().connect();
 try{
  const dashboard=await loadDashboardData(c,{scheduleDate});const snapshot=dashboardAiPayload(dashboard);
  const language=locale==="vi"?"Vietnamese":"English";
  const system=`You are the read-only AI operations analyst embedded in ST Planning, a Surface Treatment production planning system.

BUSINESS LOGIC KNOWLEDGE (${ST_AI_KNOWLEDGE_VERSION}):
${ST_AI_SYSTEM_KNOWLEDGE}

DATA ACCESS RULES:
- The current Dashboard snapshot is initial factual evidence for the selected production day.
- For a user's question, you MAY use the provided read-only database tools to inspect application data across the public PostgreSQL schema. Do not claim a database fact unless it came from the snapshot or a tool result in this request.
- Prefer get_job_context for a specific Job, get_batch_context for a specific Batch, get_day_operations for date/area/resource questions, and get_logic_reference for business-logic questions. Use database_catalog/table_schema/read_table/aggregate_table only when the domain tools do not cover the question.
- Minimize tool calls because the system uses a free AI quota. Query only the data needed to answer accurately.
- Tool access is SELECT/read-only. You have NO tool that can INSERT, UPDATE, DELETE, ALTER, DROP, execute arbitrary SQL, or mutate Planning/Batch/Schedule/Execution/configuration.
- Conversation history is intent/context only. Previous assistant statements are not database evidence.
- If evidence is insufficient after reasonable tool use, say what is missing instead of guessing.

SOURCE-OF-TRUTH RULES:
- Deterministic application/SQL logic remains authoritative for KPI, READY/WAIT, Recipe, Batch compatibility, resource constraints, and Production Execution facts.
- Distinguish observed facts from interpretation. A possible cause must be labelled as possible unless the data proves the dependency.
- Never claim you changed a Batch, Recipe, Schedule, READY/WAIT state, config, or execution status.
- Answer in concise ${language}. Cite concrete Job/Batch/Area/Resource/values from the evidence when useful.

Return the final answer as JSON with: health, headline, summary, findings, recommendations, watchlist, answer.`;

  const requestText=question
   ?`Answer this question accurately. Use read-only database tools when the dashboard snapshot alone is not enough: ${question}`
   :"Produce the automatic operations analysis. For this automatic summary, use the Dashboard snapshot only to conserve free AI quota; do not call database tools unless absolutely necessary.";

  const messages:GroqMessage[]=[
   {role:"system",content:system},
   ...history.map(x=>({role:x.role,content:x.content})),
   {role:"user",content:`${requestText}\n\nCURRENT DASHBOARD SNAPSHOT:\n${JSON.stringify(snapshot)}`},
  ];
  const audits:AiToolAudit[]=[];let content="";let providerWarning="";let toolRounds=0;
  const allowTools=Boolean(question);

  for(let round=0;round<(allowTools?maxToolRounds:1);round++){
   const callBody:Record<string,unknown>={
    model,messages,temperature:0.1,max_completion_tokens:1700,reasoning_effort:"low",
   };
   if(allowTools){callBody.tools=GROQ_READ_ONLY_TOOLS;callBody.tool_choice="auto";callBody.parallel_tool_calls=false;}
   const {response,payload}=await groqCall(baseUrl,apiKey,callBody,30000);
   if(!response.ok)return NextResponse.json({
    error:clean(payload?.error?.message)||`Groq request failed (${response.status})`,provider:"Groq",model,
    connected:response.status!==401&&response.status!==403,dataAccess:{mode:"READ_ONLY_DATABASE_TOOLS",toolsUsed:audits}
   },{status:502});
   const message=payload?.choices?.[0]?.message||{};const toolCalls=Array.isArray(message?.tool_calls)?message.tool_calls:[];
   if(!toolCalls.length){content=clean(message?.content);break;}
   toolRounds+=1;
   const selectedToolCalls=toolCalls.slice(0,1);
   messages.push({role:"assistant",content:message?.content??null,tool_calls:selectedToolCalls});
   for(const call of selectedToolCalls){
    const name=clean(call?.function?.name);let args:any={};
    try{args=JSON.parse(clean(call?.function?.arguments)||"{}");}catch{}
    try{
     const result=await executeGroqReadOnlyTool(c,name,args);audits.push(result.audit);
     messages.push({role:"tool",tool_call_id:clean(call?.id),content:compactToolContent(result.content)});
    }catch(e:any){
     messages.push({role:"tool",tool_call_id:clean(call?.id),content:JSON.stringify({error:clean(e?.message)||"Read-only tool failed",tool:name})});
    }
   }
  }

  if(!content&&allowTools){
   messages.push({role:"user",content:"Using the evidence already gathered above, give the final answer now. Do not request another database tool."});
   const {response,payload}=await groqCall(baseUrl,apiKey,{
    model,messages,temperature:0.1,max_completion_tokens:1700,reasoning_effort:"low",
    response_format:{type:"json_schema",json_schema:{name:"st_planning_ai_analysis",strict:true,schema:analysisSchema}},
   },30000);
   if(!response.ok)return NextResponse.json({error:clean(payload?.error?.message)||`Groq finalization failed (${response.status})`,provider:"Groq",model,connected:true,dataAccess:{mode:"READ_ONLY_DATABASE_TOOLS",toolsUsed:audits}},{status:502});
   content=clean(payload?.choices?.[0]?.message?.content);
  }

  let parsed=extractJson(content);
  if(!parsed&&content){
   const {response,payload}=await groqCall(baseUrl,apiKey,{
    model,messages:[
     {role:"system",content:`Convert the supplied AI answer into the required JSON schema. Preserve meaning. Output ${language}.`},
     {role:"user",content:content},
    ],temperature:0,max_completion_tokens:1700,reasoning_effort:"low",
    response_format:{type:"json_schema",json_schema:{name:"st_planning_ai_analysis",strict:true,schema:analysisSchema}},
   },20000);
   if(response.ok){const fixed=clean(payload?.choices?.[0]?.message?.content);const candidate=extractJson(fixed);if(candidate){parsed=candidate;content=fixed;}}
   if(!parsed)providerWarning="Groq is connected, but the final response did not match the structured dashboard format. Text fallback is shown.";
  }

  const baseAnalysis=parsed?normalizeAnalysis(parsed):fallbackAnalysis(content,question);
  const analysis=question&&!baseAnalysis.answer?{...baseAnalysis,answer:baseAnalysis.summary||content}:baseAnalysis;
  return NextResponse.json({
   ok:true,provider:"Groq",model,connected:true,generatedAt:new Date().toISOString(),format:parsed?"structured":"text_fallback",warning:providerWarning,analysis,
   dataAccess:{
    mode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,publicSchemaAccess:true,arbitrarySql:false,writeAccess:false,
    toolRounds,toolsUsed:audits,totalRowsInspected:audits.reduce((n,x)=>n+x.rows,0),
   }
  });
 }catch(e:any){
  const message=e?.name==="TimeoutError"?"Groq analysis timed out.":clean(e?.message)||"Dashboard AI analysis failed.";
  return NextResponse.json({error:message,provider:"Groq",model,connected:false},{status:500});
 }finally{c.release();}
}
