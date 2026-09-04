import {client,requireConfirm,url} from './common.mjs';
requireConfirm();const target=url('TARGET_DB_URL');const c=await client(target);
try{
 console.log('[prepare] Preparing Aiven public schema ownership and compatibility roles...');
 await c.query(`create extension if not exists aiven_extras cascade`);
 await c.query(`select * from aiven_extras.claim_public_schema_ownership()`);
 await c.query(`create extension if not exists pgcrypto`);
 await c.query(`do $$ begin
   if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
   if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
   if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
 end $$`);
 console.log('AIVEN PREPARE OK');
}finally{await c.end();}
