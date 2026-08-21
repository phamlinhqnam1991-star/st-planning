import { Pool } from "pg";
let pool:Pool|undefined;
export function getPool(){if(!pool){const connectionString=process.env.SUPABASE_DB_URL;if(!connectionString) throw new Error("Missing SUPABASE_DB_URL");pool=new Pool({connectionString,max:2,ssl:{rejectUnauthorized:false}})}return pool}
