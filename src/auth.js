import { createRemoteJWKSet, jwtVerify } from 'jose';
const cache = new Map();
export const isLocal = req => ['localhost','127.0.0.1'].includes(new URL(req.url).hostname);
export const safeOrigin = req => !req.headers.get('Origin') || req.headers.get('Origin') === new URL(req.url).origin || (isLocal(req) && req.headers.get('Origin') === 'http://localhost:3000');
export async function sameToken(a,b) {
 if (!a || !b || typeof a!=='string' || typeof b!=='string')return false;
 const enc=new TextEncoder(), [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
 const u=new Uint8Array(x),v=new Uint8Array(y);let n=0;
 for(let i=0;i<u.length;i++)n |= u[i]^v[i];
 return n===0;
}
export async function isAdmin(req,env){
 if (isLocal(req) && env.AUTH_MODE==='local')return sameToken(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,''),env.LOCAL_ADMIN_TOKEN);
 const {ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:aud,ACCESS_ALLOWED_EMAIL:email}=env;
 if(!domain || !aud || !email)return false;
 try{
  const issuer=domain.replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))return false;
  if(!cache.has(issuer))cache.set(issuer,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')));
  const token=req.headers.get('Cf-Access-Jwt-Assertion') || (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='))?.slice('CF_Authorization='.length);
  const {payload}=await jwtVerify(decodeURIComponent(token||''),cache.get(issuer),{issuer,audience:aud,algorithms:['RS256'],requiredClaims:['exp','iat','sub','email']});
  return typeof payload.email==='string' && payload.email.toLowerCase()===email.toLowerCase();
 }catch{return false;}
}
