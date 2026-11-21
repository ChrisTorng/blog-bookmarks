import { validIngestToken } from './token.js';
import { get,normalUrl,normalizeImageUrl,byUrl,patch } from './data.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export async function bulkStatus(req,env){
 if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
 const body=await req.json(),urls=Array.isArray(body.urls)?body.urls:[];
 if(urls.length>100)return json({error:'網址數量過多'},400);
 const normalized=[...new Set(urls.map(normalUrl))];
 const images=new Map();
 // Backfill thumbnails for already-saved bookmarks when the user revisits a BetaCat archive.
 // Only fill missing images; never change a manually assigned thumbnail.
 if(Array.isArray(body.images))for(const entry of body.images.slice(0,100)){
  try{
   const url=normalUrl(entry.url),image=normalizeImageUrl(entry.image_url);
   if(image)images.set(url,image);
  }catch{}
 }
 if(!normalized.length)return json([]);
 const marks=normalized.map(()=>'?').join(',');
 const rows=await env.DB.prepare('SELECT id,normalized_url,image_url,CASE WHEN stage=1 AND deferred=1 THEN 5 ELSE stage END AS status FROM bookmarks WHERE normalized_url IN ('+marks+')').bind(...normalized).all();
 const updates=rows.results.filter(item=>!item.image_url && images.has(item.normalized_url))
  .map(item=>env.DB.prepare('UPDATE bookmarks SET image_url=? WHERE id=? AND (image_url IS NULL OR image_url=\'\')')
   .bind(images.get(item.normalized_url),item.id));
 const publishedImageChanged=rows.results.some(item=>item.status>=3&&!item.image_url&&images.has(item.normalized_url));
 if(updates.length)await env.DB.batch(updates);
 const result=[];
 for(const item of rows.results){
  const complete=await get(env.DB,item.id,true);
  result.push({url:item.normalized_url,id:item.id,status:item.status,tags:complete.tags});
 }
 const response=json(result);
 if(publishedImageChanged)response.headers.set('X-Public-Content-Changed','1');
 return response;
}
export async function updateTags(req,env){
 if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
 const body=await req.json(),item=await byUrl(env.DB,body.url);
 if(!item)return json({error:'書籤不存在'},404);
 if(!Array.isArray(body.tags))return json({error:'缺少標籤'},400);
 const result=await patch(env.DB,item.id,{tags:body.tags});
 const response=json(result);
 if(result?.status>=3 || result?._wasPublic)response.headers.set('X-Public-Content-Changed','1');
 return response;
}
