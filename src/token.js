import { sameToken } from './auth.js';
async function digest(value){
 const raw=new TextEncoder().encode(value);
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',raw));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function validIngestToken(req,env) {
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
 if(!token || token.length>256)return false;
 const row=await env.DB.prepare('SELECT value FROM bookmark_settings WHERE key=?').bind('ingest_sha256').first();
 const matchesHash=row?.value && await sameToken(await digest(token),row.value);
 const matchesSecret=env.INGEST_TOKEN && await sameToken(token,env.INGEST_TOKEN);
 return Boolean(matchesHash||matchesSecret);
}
export async function rotateIngestToken(db) {
 const random=new Uint8Array(32);crypto.getRandomValues(random);
 const token=Array.from(random,b=>b.toString(16).padStart(2,'0')).join('');
 const now=new Date().toISOString();
 await db.prepare('INSERT INTO bookmark_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('ingest_sha256',await digest(token),now).run();
 return {token,created_at:now};
}
