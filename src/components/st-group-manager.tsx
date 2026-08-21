"use client";
import {useState} from "react";
type G={st_group:string;group_name:string;description:string|null;sort_order:number;is_active:boolean};
export function StGroupManager({rows}:{rows:G[]}){
 const [edit,setEdit]=useState<G|null>(null),[busy,setBusy]=useState(false);
 const [f,setF]=useState({st_group:"",group_name:"",description:""});
 function start(g:G){setEdit(g);setF({st_group:g.st_group,group_name:g.group_name,description:g.description||""})}
 function clear(){setEdit(null);setF({st_group:"",group_name:"",description:""})}
 async function save(){if(!f.st_group.trim())return alert("Nhập ST Group.");setBusy(true);try{
  const r=await fetch("/api/master/st-group",{method:edit?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(f)});const d=await r.json();if(!r.ok)throw new Error(d.error);location.reload()
 }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function deactivate(g:G){if(!confirm(`Deactivate ST Group ${g.st_group}?`))return;setBusy(true);try{
  const r=await fetch("/api/master/st-group",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({st_group:g.st_group})});const d=await r.json();if(!r.ok)throw new Error(d.error);location.reload()
 }catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <><div className="card"><h2 style={{marginTop:0}}>{edit?"Edit ST Group":"+ Add ST Group"}</h2>
 <div className="group-form"><label>ST Group Code<input className="input" disabled={!!edit} value={f.st_group} onChange={e=>setF({...f,st_group:e.target.value.toUpperCase()})}/></label><label>Group Name<input className="input" value={f.group_name} onChange={e=>setF({...f,group_name:e.target.value})}/></label><label>Description<input className="input" value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></label></div>
 <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy} onClick={save}>{edit?"Save Changes":"Add ST Group"}</button>{edit&&<button className="btn" onClick={clear}>Cancel</button>}</div></div>
 <div className="card section" style={{overflowX:"auto"}}><table><thead><tr><th>ST Group</th><th>Group Name</th><th>Description</th><th>Action</th></tr></thead><tbody>{rows.map(g=><tr key={g.st_group}><td><b>{g.st_group}</b></td><td>{g.group_name}</td><td>{g.description||""}</td><td><div className="row"><button className="btn small" onClick={()=>start(g)}>Edit</button><button className="btn danger-btn small" onClick={()=>deactivate(g)}>Deactivate</button></div></td></tr>)}</tbody></table></div></>
}