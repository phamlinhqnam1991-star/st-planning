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
type AiMessage={role:string;content?:string|null;tool_calls?:any[];tool_call_id?:string};
type ProviderName="Groq"|"OpenRouter";
type ProviderConfig={name:ProviderName;apiKey:string;model:string;baseUrl:string;extraHeaders:Record<string,string>};
type ProviderStatus={provider:ProviderName;configured:boolean;connected:boolean;model:string;modelAvailable:boolean;message:string};

type ProviderCallResult={response:Response;payload:any;provider:ProviderConfig;fallbackUsed:boolean;attempts:{provider:ProviderName;status:number;message:string}[]};

function providerConfig(){
 const groq:ProviderConfig={
  name:"Groq",
  apiKey:clean(process.env.GROQ_API_KEY),
  model:clean(process.env.GROQ_MODEL)||"openai/gpt-oss-20b",
  baseUrl:(clean(process.env.GROQ_BASE_URL)||"https://api.groq.com/openai/v1").replace(/\/$/,""),
  extraHeaders:{},
 };
 const openRouterHeaders:Record<string,string>={};
 const referer=clean(process.env.OPENROUTER_SITE_URL);
 const appName=clean(process.env.OPENROUTER_APP_NAME)||"ST Planning";
 if(referer)openRouterHeaders["HTTP-Referer"]=referer;
 if(appName)openRouterHeaders["X-Title"]=appName;
 const openrouter:ProviderConfig={
  name:"OpenRouter",
  apiKey:clean(process.env.OPENROUTER_API_KEY),
  model:clean(process.env.OPENROUTER_MODEL)||"openrouter/free",
  baseUrl:(clean(process.env.OPENROUTER_BASE_URL)||"https://openrouter.ai/api/v1").replace(/\/$/,""),
  extraHeaders:openRouterHeaders,
 };
 return {
  primary:groq,
  fallback:openrouter,
  maxToolRounds:Math.max(1,Math.min(6,Number(process.env.AI_MAX_TOOL_ROUNDS)||Number(process.env.GROQ_AI_MAX_TOOL_ROUNDS)||4)),
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

function fallbackAnalysis(content:string,question:string,provider:ProviderName){
 const value=clean(content).slice(0,2600);
 return {
  health:"WATCH" as const,
  headline:`${provider} connected — text response received`,
  summary:question?`${provider} answered successfully, but the response did not match the structured dashboard format.`:value,
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

function providerRequestBody(provider:ProviderConfig,body:Record<string,unknown>){
 if(provider.name==="Groq")return body;
 const out={...body};
 // OpenRouter's free router selects a compatible model from request features.
 // Provider-specific Groq reasoning controls are intentionally omitted.
 delete out.reasoning_effort;
 return out;
}

async function rawProviderCall(provider:ProviderConfig,body:Record<string,unknown>,timeout:number){
 const response=await fetch(`${provider.baseUrl}/chat/completions`,{
  method:"POST",
  headers:{authorization:`Bearer ${provider.apiKey}`,"content-type":"application/json",...provider.extraHeaders},
  body:JSON.stringify(providerRequestBody(provider,body)),
  signal:AbortSignal.timeout(timeout),
 });
 const payload=await response.json().catch(()=>({}));
 return {response,payload};
}

async function testProvider(provider:ProviderConfig):Promise<ProviderStatus>{
 if(!provider.apiKey)return {provider:provider.name,configured:false,connected:false,model:provider.model,modelAvailable:false,message:`${provider.name} API key is not configured.`};
 try{
  const response=await fetch(`${provider.baseUrl}/models`,{
   headers:{authorization:`Bearer ${provider.apiKey}`,...provider.extraHeaders},signal:AbortSignal.timeout(10000),cache:"no-store"
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {provider:provider.name,configured:true,connected:false,model:provider.model,modelAvailable:false,message:clean(payload?.error?.message)||`${provider.name} connection test failed (${response.status}).`};
  const models=Array.isArray(payload?.data)?payload.data:[];
  const modelAvailable=(provider.name==="OpenRouter"&&provider.model==="openrouter/free")||models.some((x:any)=>clean(x?.id)===provider.model);
  return {provider:provider.name,configured:true,connected:true,model:provider.model,modelAvailable,message:modelAvailable?`${provider.name} connected and the configured model is available.`:`${provider.name} connected, but the configured model was not found in the model list.`};
 }catch(e:any){
  return {provider:provider.name,configured:true,connected:false,model:provider.model,modelAvailable:false,message:e?.name==="TimeoutError"?`${provider.name} connection test timed out.`:clean(e?.message)||`Unable to connect to ${provider.name}.`};
 }
}

function errorResponse(message:string,status=502,extra:Record<string,unknown>={}){
 return NextResponse.json({error:message,...extra},{status});
}

export async function GET(){
 const denied=await requireApiUser();if(denied)return denied;
 const {primary,fallback,maxToolRounds}=providerConfig();
 const [groqStatus,openRouterStatus]=await Promise.all([testProvider(primary),testProvider(fallback)]);
 const configured=groqStatus.configured||openRouterStatus.configured;
 const connected=groqStatus.connected||openRouterStatus.connected;
 const active=groqStatus.connected?groqStatus:openRouterStatus.connected?openRouterStatus:groqStatus.configured?groqStatus:openRouterStatus;
 const message=groqStatus.connected
  ?`Groq primary is connected. OpenRouter fallback: ${openRouterStatus.connected?"ready":openRouterStatus.configured?"not connected":"not configured"}.`
  :openRouterStatus.connected
   ?`Groq primary is unavailable. OpenRouter fallback is connected and ready.`
   :`No AI provider is currently connected. Groq: ${groqStatus.message} OpenRouter: ${openRouterStatus.message}`;
 return NextResponse.json({
  ok:true,provider:active.provider,configured,connected,model:active.model,modelAvailable:active.modelAvailable,
  providerChain:"Groq → OpenRouter",primaryProvider:"Groq",fallbackProvider:"OpenRouter",providers:[groqStatus,openRouterStatus],
  toolUseAvailable:connected,accessMode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,maxToolRounds,
  toolNames:GROQ_READ_ONLY_TOOLS.map(x=>x.function.name),message,
 });
}

export async function POST(req:Request){
 const denied=await requireApiUser();if(denied)return denied;
 const {primary,fallback,maxToolRounds}=providerConfig();
 const configuredProviders=[primary,fallback].filter(x=>x.apiKey);
 if(!configuredProviders.length)return errorResponse("No AI provider is configured. Add GROQ_API_KEY and/or OPENROUTER_API_KEY.",503,{code:"AI_NOT_CONFIGURED",provider:"None",connected:false,providerChain:"Groq → OpenRouter"});

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
- Minimize tool calls because the system uses free AI quotas. Query only the data needed to answer accurately.
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

  const messages:AiMessage[]=[
   {role:"system",content:system},
   ...history.map(x=>({role:x.role,content:x.content})),
   {role:"user",content:`${requestText}\n\nCURRENT DASHBOARD SNAPSHOT:\n${JSON.stringify(snapshot)}`},
  ];
  const audits:AiToolAudit[]=[];let content="";let providerWarning="";let toolRounds=0;
  const allowTools=Boolean(question);let activeProvider=configuredProviders[0];let fallbackUsed=activeProvider.name!=="Groq";
  const attempts:{provider:ProviderName;status:number;message:string}[]=[];

  async function aiCall(baseBody:Record<string,unknown>,timeout=30000):Promise<ProviderCallResult>{
   const order=[activeProvider,...configuredProviders.filter(x=>x.name!==activeProvider.name)];
   let lastPayload:any={};let lastResponse:Response|null=null;let lastProvider=activeProvider;
   for(const provider of order){
    lastProvider=provider;
    try{
     const {response,payload}=await rawProviderCall(provider,{...baseBody,model:provider.model},timeout);
     lastPayload=payload;lastResponse=response;
     if(response.ok){
      if(provider.name!=="Groq")fallbackUsed=true;
      activeProvider=provider;
      return {response,payload,provider,fallbackUsed,attempts};
     }
     attempts.push({provider:provider.name,status:response.status,message:clean(payload?.error?.message)||`${provider.name} request failed (${response.status})`});
    }catch(e:any){
     attempts.push({provider:provider.name,status:0,message:e?.name==="TimeoutError"?`${provider.name} timed out.`:clean(e?.message)||`${provider.name} request failed.`});
    }
   }
   if(lastResponse)return {response:lastResponse,payload:lastPayload,provider:lastProvider,fallbackUsed,attempts};
   throw new Error(attempts.at(-1)?.message||"All AI providers failed.");
  }

  for(let round=0;round<(allowTools?maxToolRounds:1);round++){
   const callBody:Record<string,unknown>={messages,temperature:0.1,max_completion_tokens:1700,reasoning_effort:"low"};
   if(allowTools){callBody.tools=GROQ_READ_ONLY_TOOLS;callBody.tool_choice="auto";callBody.parallel_tool_calls=false;}
   const {response,payload,provider}=await aiCall(callBody,30000);
   if(!response.ok)return errorResponse(clean(payload?.error?.message)||"All AI providers failed.",502,{provider:provider.name,model:provider.model,connected:false,providerChain:"Groq → OpenRouter",fallbackUsed,dataAccess:{mode:"READ_ONLY_DATABASE_TOOLS",toolsUsed:audits},attempts});
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
    }catch(e:any){messages.push({role:"tool",tool_call_id:clean(call?.id),content:JSON.stringify({error:clean(e?.message)||"Read-only tool failed",tool:name})});}
   }
  }

  if(!content&&allowTools){
   messages.push({role:"user",content:"Using the evidence already gathered above, give the final answer now. Do not request another database tool."});
   const {response,payload,provider}=await aiCall({
    messages,temperature:0.1,max_completion_tokens:1700,reasoning_effort:"low",
    response_format:{type:"json_schema",json_schema:{name:"st_planning_ai_analysis",strict:true,schema:analysisSchema}},
   },30000);
   // If aiCall falls back, ensure a provider-specific retry uses the correct model if needed.
   if(!response.ok)return errorResponse(clean(payload?.error?.message)||"AI finalization failed.",502,{provider:provider.name,model:provider.model,connected:false,providerChain:"Groq → OpenRouter",fallbackUsed,dataAccess:{mode:"READ_ONLY_DATABASE_TOOLS",toolsUsed:audits},attempts});
   content=clean(payload?.choices?.[0]?.message?.content);
  }

  let parsed=extractJson(content);
  if(!parsed&&content){
   const normalizeMessages=[
    {role:"system",content:`Convert the supplied AI answer into the required JSON schema. Preserve meaning. Output ${language}.`},
    {role:"user",content:content},
   ];
   // Use current active provider first; fallback remains available if it fails.
   const order=[activeProvider,...configuredProviders.filter(x=>x.name!==activeProvider.name)];
   for(const provider of order){
    try{
     const {response,payload}=await rawProviderCall(provider,{
      model:provider.model,messages:normalizeMessages,temperature:0,max_completion_tokens:1700,
      response_format:{type:"json_schema",json_schema:{name:"st_planning_ai_analysis",strict:true,schema:analysisSchema}},
     },20000);
     if(!response.ok){attempts.push({provider:provider.name,status:response.status,message:clean(payload?.error?.message)||`${provider.name} normalization failed.`});continue;}
     if(provider.name!=="Groq")fallbackUsed=true;activeProvider=provider;
     const fixed=clean(payload?.choices?.[0]?.message?.content);const candidate=extractJson(fixed);if(candidate){parsed=candidate;content=fixed;break;}
    }catch(e:any){attempts.push({provider:provider.name,status:0,message:clean(e?.message)||`${provider.name} normalization failed.`});}
   }
   if(!parsed)providerWarning=`${activeProvider.name} is connected, but the final response did not match the structured dashboard format. Text fallback is shown.`;
  }

  const baseAnalysis=parsed?normalizeAnalysis(parsed):fallbackAnalysis(content,question,activeProvider.name);
  const analysis=question&&!baseAnalysis.answer?{...baseAnalysis,answer:baseAnalysis.summary||content}:baseAnalysis;
  return NextResponse.json({
   ok:true,provider:activeProvider.name,model:activeProvider.model,providerChain:"Groq → OpenRouter",fallbackUsed,connected:true,
   generatedAt:new Date().toISOString(),format:parsed?"structured":"text_fallback",warning:providerWarning,analysis,attempts,
   dataAccess:{
    mode:"READ_ONLY_DATABASE_TOOLS",knowledgeVersion:ST_AI_KNOWLEDGE_VERSION,publicSchemaAccess:true,arbitrarySql:false,writeAccess:false,
    toolRounds,toolsUsed:audits,totalRowsInspected:audits.reduce((n,x)=>n+x.rows,0),
   }
  });
 }catch(e:any){
  const message=e?.name==="TimeoutError"?"AI analysis timed out.":clean(e?.message)||"Dashboard AI analysis failed.";
  return errorResponse(message,500,{provider:"Groq → OpenRouter",connected:false,providerChain:"Groq → OpenRouter"});
 }finally{c.release();}
}
