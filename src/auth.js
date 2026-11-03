const certCache = new Map();
export const isLocal = req => ['localhost','127.0.0.1'].includes(new URL(req.url).hostname);
export const safeOrigin = req => !req.headers.get('Origin') || req.headers.get('Origin')===new URL(req.url).origin || (isLocal(req)&&req.headers.get('Origin')==='http://localhost:3000');
export async function sameToken(a,b) {
 if(!a||!b||typeof a!=='string'||typeof b!=='string')return false;
 const encoder=new TextEncoder();
 const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
 const left=new Uint8Array(x),right=new Uint8Array(y);
 let difference=0;
 for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
 return difference===0;
}
function base64url(value) {
 if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid JWT segment');
 const s=value.replace(/-/g,'+').replace(/_/g,'/');
 const bytes=atob(s+'='.repeat((4-s.length%4)%4));
 return Uint8Array.from(bytes,c=>c.charCodeAt(0));
}
function claimSegment(value) {
 return JSON.parse(new TextDecoder().decode(base64url(value)));
}
function jwtFrom(req) {
 const header=req.headers.get('Cf-Access-Jwt-Assertion');
 if(header)return header;
 const cookie=(req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='));
 if(!cookie)return '';
 try{return decodeURIComponent(cookie.slice('CF_Authorization='.length));}catch{return '';}
}
async function accessKeys(issuer) {
 const existing=certCache.get(issuer);
 if(existing&&Date.now()<existing.expires)return existing.keys;
 const response=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Invalid Access certificates');
 const body=await response.json();
 if(!Array.isArray(body.keys))throw Error('Invalid Access JWK set');
 certCache.set(issuer,{keys:body.keys,expires:Date.now()+600000});
 return body.keys;
}
export async function verifyAccessToken(token,{issuer,audience,email}) {
 const parts=String(token).split('.');
 if(parts.length!==3) return false;
 const header=claimSegment(parts[0]);
 if(header.alg!=='RS256'||typeof header.kid!=='string')return false;
 const payload=claimSegment(parts[1]);
 const now=Math.floor(Date.now()/1000);
 if(payload.iss!==issuer || !(payload.aud===audience || (Array.isArray(payload.aud)&&payload.aud.includes(audience))))return false;
 if(typeof payload.sub!=='string'||!payload.sub||typeof payload.email!=='string'||payload.email.toLowerCase()!==email.toLowerCase())return false;
 if(typeof payload.exp!=='number'||payload.exp<=now||typeof payload.iat!=='number'||payload.iat>now+60)return false;
 if(payload.nbf!==undefined && (typeof payload.nbf!=='number'||payload.nbf>now+60))return false;
 const keys=await accessKeys(issuer);
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');
 if(!jwk)return false;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
}
export async function isAdmin(req,env){
 if(isLocal(req)&&env.AUTH_MODE==='local') {
  if(!env.LOCAL_ADMIN_TOKEN || env.LOCAL_ADMIN_TOKEN.length<20)return false;
  return sameToken(req.headers.get('Authorization')?.replace(/^Bearer\s+/i,''),env.LOCAL_ADMIN_TOKEN);
 }
 const {ACCESS_TEAM_DOMAIN:domain,ACCESS_AUD:aud,ACCESS_ALLOWED_EMAIL:email}=env;
 if(!domain||!aud||!email)return false;
 const issuer=domain.replace(/\/$/,'');
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer))return false;
 try{return await verifyAccessToken(jwtFrom(req),{issuer,audience:aud,email});}catch{return false;}
}
