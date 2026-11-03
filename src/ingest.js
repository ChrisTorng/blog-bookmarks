import { sameToken } from './auth.js';
import { get,normalUrl,byUrl,patch } from './data.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
async function authorized(req,env){
 const value=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
 return sameToken(value,env.INGEST_TOKEN);
}
export async function bulkStatus(req,env){
 if(!await authorized(req,env))return json({error:'Token 無效'},401);
 const body=await req.json(),urls=Array.isArray(body.urls)?body.urls:[];
 if(urls.length>100)return json({error:'網址數量過多'},400);
 const normalized=[...new Set(urls.map(normalUrl))];
 if(!normalized.length)return json([]);
 const marks=normalized.map(()=>'?').join(',');
 const rows=await env.DB.prepare('SELECT id,normalized_url,status FROM bookmarks WHERE normalized_url IN ('+marks+')').bind(...normalized).all();
 const result=[];
 for(const item of rows.results){
  const complete=await get(env.DB,item.id,true);
  result.push({url:item.normalized_url,id:item.id,status:item.status,tags:complete.tags});
 }
 return json(result);
}
export async function updateTags(req,env){
 if(!await authorized(req,env))return json({error:'Token 無效'},401);
 const body=await req.json(),item=await byUrl(env.DB,body.url);
 if(!item)return json({error:'書籤不存在'},404);
 if(!Array.isArray(body.tags))return json({error:'缺少標籤'},400);
 const result=await patch(env.DB,item.id,{tags:body.tags});
 return json(result);
}
