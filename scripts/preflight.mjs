import {client,dbSize,fail,human,mask,publicTables,sameDatabase,url} from './common.mjs';
const source=url('SOURCE_DB_URL'),target=url('TARGET_DB_URL');
if(sameDatabase(source,target))fail('SOURCE_DB_URL and TARGET_DB_URL point to the same database.');
console.log(`[preflight] SOURCE ${mask(source)}`);console.log(`[preflight] TARGET ${mask(target)}`);
let s,t;
try{
 s=await client(source);t=await client(target);
 const [sv,tv]=await Promise.all([s.query('select version()'),t.query('select version()')]);
 const [ss,ts,st,tt]=await Promise.all([dbSize(s),dbSize(t),publicTables(s),publicTables(t)]);
 console.log(`[preflight] Source size       : ${human(ss)}`);
 console.log(`[preflight] Source public tbl : ${st.length}`);
 console.log(`[preflight] Target size       : ${human(ts)}`);
 console.log(`[preflight] Target public tbl : ${tt.length}`);
 console.log(`[preflight] Source PostgreSQL : ${String(sv.rows[0].version).split(',')[0]}`);
 console.log(`[preflight] Target PostgreSQL : ${String(tv.rows[0].version).split(',')[0]}`);
 if(st.length===0)fail('Source public schema has no tables.');
 if(tt.length>0)fail(`Target Aiven public schema is not empty (${tt.length} tables). Use a NEW Aiven service/database for this full restore.`);
 if(ss>900*1024*1024)console.warn('[WARN] Source database is above 900 MB; Aiven Free has only 1 GB disk and restore may not fit.');
 else console.log('[preflight] Source size is below 900 MB. Current ~600 MB project is suitable for a first full-copy attempt on 1 GB Aiven Free.');
 console.log('\nPRE-FLIGHT OK');
}finally{await s?.end().catch(()=>{});await t?.end().catch(()=>{});}
