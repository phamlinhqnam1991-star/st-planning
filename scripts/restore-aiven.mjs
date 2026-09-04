import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {client,fail,mask,pgTool,publicTables,requireConfirm,resolvedDump,url} from './common.mjs';
requireConfirm();const target=url('TARGET_DB_URL');const file=resolvedDump();if(!existsSync(file))fail(`Dump not found: ${file}`);
const pre=await client(target);try{const tables=await publicTables(pre);if(tables.length)fail(`Target public schema is not empty (${tables.length} tables). Restore aborted to avoid overwriting data.`);}finally{await pre.end();}
const {cmd,version}=pgTool('pg_restore');console.log(`[restore] Target : ${mask(target)}`);console.log(`[restore] Tool   : ${version}`);console.log(`[restore] Dump   : ${file}`);
const args=['--dbname',target,'--no-owner','--no-privileges','--no-comments','--exit-on-error','--schema=public','--verbose',file];
const r=spawnSync(cmd,args,{stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)fail(`pg_restore failed${r.error?`: ${r.error.message}`:` code ${r.status}`}. Do not point Vercel to Aiven yet.`);
const post=await client(target);try{await post.query('analyze');}finally{await post.end();}
console.log('AIVEN RESTORE OK');
