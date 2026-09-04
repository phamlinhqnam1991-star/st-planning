import 'dotenv/config';
import {Client} from 'pg';
import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';

export function fail(msg){console.error(`\n[FAIL] ${msg}\n`);process.exit(1);}
export function requireConfirm(){if(process.env.MIGRATION_CONFIRM!=='SUPABASE_TO_AIVEN_FULL')fail('Set MIGRATION_CONFIRM=SUPABASE_TO_AIVEN_FULL in .env.');}
export function url(name){const raw=process.env[name];if(!raw)fail(`Missing ${name} in .env.`);try{return new URL(raw).toString();}catch{fail(`${name} is not a valid PostgreSQL URI.`);}}
export function mask(raw){try{const u=new URL(raw);if(u.password)u.password='***';return u.toString();}catch{return '[invalid-url]';}}
export async function client(raw){const c=new Client({connectionString:raw,connectionTimeoutMillis:15000,application_name:'st-planning-aiven-migration'});await c.connect();return c;}
export async function publicTables(c){const q=await c.query(`select tablename from pg_tables where schemaname='public' order by tablename`);return q.rows.map(r=>String(r.tablename));}
export async function dbSize(c){const q=await c.query(`select pg_database_size(current_database())::bigint bytes`);return Number(q.rows[0].bytes);}
export function human(n){const u=['B','KB','MB','GB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++;}return `${v.toFixed(i?1:0)} ${u[i]}`;}
export function pgTool(name){
 const envName=name==='pg_dump'?'PG_DUMP_PATH':'PG_RESTORE_PATH';const out=[];
 if(process.env[envName])out.push(process.env[envName]);out.push(name);
 if(process.platform==='win32'){
  const root='C:\\Program Files\\PostgreSQL';
  if(existsSync(root)){try{for(const v of readdirSync(root).sort((a,b)=>Number(b)-Number(a)))out.push(join(root,v,'bin',`${name}.exe`));}catch{}}
 }
 for(const cmd of [...new Set(out)]){const r=spawnSync(cmd,['--version'],{encoding:'utf8',windowsHide:true});if(!r.error&&r.status===0)return {cmd,version:String(r.stdout||r.stderr).trim()};}
 fail(`${name} not found. Install PostgreSQL client tools or set ${envName}.`);
}
export function sameDatabase(a,b){try{const x=new URL(a),y=new URL(b);return x.hostname===y.hostname&&x.port===y.port&&x.pathname===y.pathname&&decodeURIComponent(x.username)===decodeURIComponent(y.username);}catch{return false;}}
export function resolvedDump(){return resolve(process.env.DUMP_FILE||'artifacts/st-planning-full.dump');}
