#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readdirSync,readFileSync,statSync,writeFileSync,existsSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';

function loadEnvFile(path){
  if(!existsSync(path)) return;
  const text=readFileSync(path,'utf8');
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#')) continue;
    const eq=line.indexOf('=');
    if(eq<1) continue;
    const key=line.slice(0,eq).trim();
    let value=line.slice(eq+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    if(process.env[key]===undefined) process.env[key]=value;
  }
}
loadEnvFile(resolve('.env.local'));
loadEnvFile(resolve('.env'));

function fail(msg){console.error(`\n[db-backup] ${msg}\n`);process.exit(1);}
function pad(n){return String(n).padStart(2,'0');}
function stamp(d=new Date()){
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function humanBytes(n){
  const units=['B','KB','MB','GB','TB']; let i=0,v=n;
  while(v>=1024&&i<units.length-1){v/=1024;i++;}
  return `${v.toFixed(i?2:0)} ${units[i]}`;
}
function maskUrl(raw){
  try{const u=new URL(raw); if(u.password)u.password='***'; return u.toString();}catch{return '[invalid-url]';}
}
function candidatePgTools(name){
  const out=[];
  const envName=name==='pg_dump'?'PG_DUMP_PATH':'PG_RESTORE_PATH';
  if(process.env[envName]) out.push(process.env[envName]);
  out.push(name);
  if(process.platform==='win32'){
    const root='C:\\Program Files\\PostgreSQL';
    if(existsSync(root)){
      try{
        const versions=readdirSync(root).sort((a,b)=>Number(b)-Number(a));
        for(const v of versions) out.push(join(root,v,'bin',`${name}.exe`));
      }catch{}
    }
  }
  return [...new Set(out)];
}
function resolvePgTool(name){
  for(const cmd of candidatePgTools(name)){
    const r=spawnSync(cmd,['--version'],{encoding:'utf8',windowsHide:true});
    if(!r.error&&r.status===0) return {cmd,version:(r.stdout||r.stderr||'').trim()};
  }
  fail(`${name} was not found. Install PostgreSQL client tools or set ${name==='pg_dump'?'PG_DUMP_PATH':'PG_RESTORE_PATH'} in .env.local.`);
}
function backupUrl(){
  const raw=process.env.SUPABASE_DB_BACKUP_URL||process.env.DB_CONNECTION_STRING||process.env.SUPABASE_DB_URL;
  if(!raw) fail('Missing SUPABASE_DB_BACKUP_URL / DB_CONNECTION_STRING / SUPABASE_DB_URL.');
  let u;
  try{u=new URL(raw);}catch{fail('Database connection URL is invalid.');}
  // Runtime uses Supabase Transaction Pooler :6543. pg_dump is safer through
  // Session Pooler :5432. Users can always override with SUPABASE_DB_BACKUP_URL.
  if(!process.env.SUPABASE_DB_BACKUP_URL && u.hostname.endsWith('.pooler.supabase.com') && u.port==='6543'){
    u.port='5432';
    console.log('[db-backup] Runtime URL uses Transaction Pooler :6543 -> backup will use Session Pooler :5432.');
  }
  return u.toString();
}
function sha256(path){
  const hash=createHash('sha256'); hash.update(readFileSync(path)); return hash.digest('hex');
}

const {cmd:pgDump,version}=resolvePgTool('pg_dump');
const url=backupUrl();
const outDir=resolve(process.env.DB_BACKUP_DIR||'backups');
mkdirSync(outDir,{recursive:true});
const file=join(outDir,`st-planning_${stamp()}.dump`);
const args=[
  '--dbname',url,
  '--format=custom',
  '--compress=6',
  '--schema=public',
  '--no-owner',
  '--no-privileges',
  '--verbose',
  '--file',file
];
console.log(`[db-backup] Source : ${maskUrl(url)}`);
console.log(`[db-backup] Scope  : schema public (structure + data + functions/views in public)`);
console.log(`[db-backup] Output : ${file}`);
console.log(`[db-backup] Tool   : ${version}`);
console.log('[db-backup] Starting consistent pg_dump backup...');
const started=Date.now();
const r=spawnSync(pgDump,args,{stdio:'inherit',windowsHide:true});
if(r.error||r.status!==0){
  fail(`pg_dump failed${r.error?`: ${r.error.message}`:` with exit code ${r.status}`}. Existing database data was not changed.`);
}
const info=statSync(file);
const manifest={
  version:1,
  app:'ST Planning',
  createdAt:new Date().toISOString(),
  scope:'public',
  format:'PostgreSQL custom dump',
  source:maskUrl(url),
  pgDumpVersion:version,
  file:basename(file),
  bytes:info.size,
  sha256:sha256(file),
  elapsedSeconds:Number(((Date.now()-started)/1000).toFixed(1))
};
const manifestFile=`${file}.manifest.json`;
writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
console.log(`\n[db-backup] DONE   : ${file}`);
console.log(`[db-backup] Size   : ${humanBytes(info.size)}`);
console.log(`[db-backup] SHA256 : ${manifest.sha256}`);
console.log(`[db-backup] Manifest: ${manifestFile}`);
console.log('[db-backup] Keep both files in a safe location outside the project folder.');
