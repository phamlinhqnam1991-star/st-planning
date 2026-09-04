import {client,dbSize,human,publicTables,url} from './common.mjs';
const source=url('SOURCE_DB_URL'),target=url('TARGET_DB_URL');let s,t;
try{
 s=await client(source);t=await client(target);
 const sourceTables=await publicTables(s),targetTables=await publicTables(t);
 const missing=sourceTables.filter(x=>!targetTables.includes(x));const extra=targetTables.filter(x=>!sourceTables.includes(x));
 let failures=0;
 if(missing.length){failures++;console.error('[FAIL] Missing target tables:',missing.join(', '));}
 if(extra.length)console.warn('[WARN] Extra target tables:',extra.join(', '));
 console.log(`[verify] Comparing exact row counts for ${sourceTables.length} public tables...`);
 for(const table of sourceTables){
   const ident='"'+table.replaceAll('"','""')+'"';
   const [a,b]=await Promise.all([s.query(`select count(*)::bigint n from public.${ident}`),t.query(`select count(*)::bigint n from public.${ident}`)]);
   const x=String(a.rows[0].n),y=String(b.rows[0].n);if(x!==y){failures++;console.error(`[FAIL] ${table}: source=${x} target=${y}`);}else console.log(`[OK] ${table}: ${x}`);
 }
 const [ss,ts]=await Promise.all([dbSize(s),dbSize(t)]);console.log(`\n[verify] Source DB size: ${human(ss)}`);console.log(`[verify] Aiven  DB size: ${human(ts)}`);
 if(ts>900*1024*1024)console.warn('[WARN] Aiven database is above 900 MB. Reduce indexes/history soon after cutover.');
 if(failures){console.error(`\nVERIFY FAILED: ${failures} mismatch(es). Do not switch Vercel.`);process.exitCode=1;}else console.log('\nVERIFY OK — table set and row counts match.');
}finally{await s?.end().catch(()=>{});await t?.end().catch(()=>{});}
