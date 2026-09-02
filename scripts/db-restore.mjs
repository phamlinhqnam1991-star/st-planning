#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

function loadEnvFile(path){
  if(!existsSync(path)) return;
  const text=readFileSync(path,'utf8');
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line||line.startsWith('#')) continue;
    const eq=line.indexOf('='); if(eq<1) continue;
    const key=line.slice(0,eq).trim(); let value=line.slice(eq+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))) value=value.slice(1,-1);
    if(process.env[key]===undefined) process.env[key]=value;
  }
}
loadEnvFile(resolve('.env.local')); loadEnvFile(resolve('.env'));
function fail(msg){console.error(`\n[db-restore] ${msg}\n`);process.exit(1);}
function candidates(){
  const out=[]; if(process.env.PG_RESTORE_PATH)out.push(process.env.PG_RESTORE_PATH); out.push('pg_restore');
  if(process.platform==='win32'){
    const root='C:\\Program Files\\PostgreSQL';
    if(existsSync(root)){try{for(const v of readdirSync(root).sort((a,b)=>Number(b)-Number(a)))out.push(join(root,v,'bin','pg_restore.exe'));}catch{}}
  }
  return [...new Set(out)];
}
function tool(){
  for(const cmd of candidates()){
    const r=spawnSync(cmd,['--version'],{encoding:'utf8',windowsHide:true});
    if(!r.error&&r.status===0)return cmd;
  }
  fail('pg_restore was not found. Install PostgreSQL client tools or set PG_RESTORE_PATH.');
}
function dbUrl(){
  const raw=process.env.SUPABASE_DB_RESTORE_URL||process.env.SUPABASE_DB_BACKUP_URL||process.env.DB_CONNECTION_STRING||process.env.SUPABASE_DB_URL;
  if(!raw)fail('Missing restore database URL. Prefer SUPABASE_DB_RESTORE_URL.');
  const u=new URL(raw);
  if(!process.env.SUPABASE_DB_RESTORE_URL&&!process.env.SUPABASE_DB_BACKUP_URL&&u.hostname.endsWith('.pooler.supabase.com')&&u.port==='6543')u.port='5432';
  return u.toString();
}
function mask(raw){try{const u=new URL(raw);if(u.password)u.password='***';return u.toString();}catch{return '[invalid-url]';}}

const fileArg=process.argv.find(a=>a.endsWith('.dump'));
if(!fileArg)fail('Usage: npm run db:restore -- backups/st-planning_YYYYMMDD_HHMMSS.dump --confirm=RESTORE');
const file=resolve(fileArg);
if(!existsSync(file))fail(`Backup file not found: ${file}`);
if(!process.argv.includes('--confirm=RESTORE')){
  fail('Restore is destructive. Re-run with --confirm=RESTORE only after verifying the target database.');
}
const url=dbUrl();
console.log(`[db-restore] Target : ${mask(url)}`);
console.log(`[db-restore] Backup : ${file}`);
console.log('[db-restore] Scope  : public schema');
console.log('[db-restore] WARNING: --clean removes/replaces objects from public that exist in the dump.');
const args=[
  '--dbname',url,
  '--clean','--if-exists',
  '--no-owner','--no-privileges',
  '--exit-on-error',
  '--schema=public',
  '--verbose',
  file
];
const r=spawnSync(tool(),args,{stdio:'inherit',windowsHide:true});
if(r.error||r.status!==0)fail(`pg_restore failed${r.error?`: ${r.error.message}`:` with exit code ${r.status}`}.`);
console.log('\n[db-restore] DONE. Restart/redeploy the app and verify Configuration, Open Jobs, Planning, Batch and Schedule.');
