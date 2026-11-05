import {isAdmin,safeOrigin,sameToken} from './auth.js';
import {bulkStatus,updateTags} from './ingest.js';
import {review,invalidSummary} from './metadata.js';
import {validIngestToken,rotateIngestToken} from './token.js';
import {list,get,byUrl,create,patch,remove,tagsList,renameTag,reviewWindow} from './data.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export function opts(url,privateList=false){return {privateList,filter:url.searchParams.get('filter')||(privateList?'pending':'published'),tag:url.searchParams.get('tag')||'',page:url.searchParams.get('page')||1,sort:url.searchParams.get('sort')||'new',q:url.searchParams.get('q')||'',from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||''};}
async function input(req){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw Error('需要 JSON 格式');
 const length=Number(req.headers.get('Content-Length')||0);if(length>100000)throw Error('資料過大');
 const str=await req.text();if(str.length>100000)throw Error('資料過大');
 return JSON.parse(str);
}
export async function api(req,env,url){
 const p=url.pathname;
 const privateApi=p==='/bookmarks/api/admin'||p.startsWith('/bookmarks/api/admin/');
 if(privateApi && !await isAdmin(req,env))return json({error:'未經管理員驗證'},401);
 if(!p.startsWith('/bookmarks/api/ingest') && !safeOrigin(req)&&!['GET','HEAD'].includes(req.method))return json({error:'Origin 不符'},403);
 try{
  if(p==='/bookmarks/api/admin'||p==='/bookmarks/api/admin/'){
   if(req.method==='GET')return json(await list(env.DB,opts(url,true)));
   if(req.method==='POST')return json(await create(env.DB,await input(req)),201);
  }
  if(p==='/bookmarks/api/admin/quick'&&req.method==='GET')
    return json(await reviewWindow(env.DB,url.searchParams.get('size')));
  if(p==='/bookmarks/api/admin/enrich' && req.method==='POST'){
    const body=await input(req);
    if(!/^[0-9a-f-]{36}$/.test(String(body.id||'')))return json({error:'書籤 ID 無效'},400);
    const item=await get(env.DB,body.id,true);
    if(!item)return json({error:'書籤不存在'},404);
    const report=await review(item);
    const title=!item.title_original&&report.verified?report.title_original:null;
    const summary=invalidSummary(item.summary)&&report.verified?report.summary:null;
    if(body.apply===true&&(title||summary)){
      await env.DB.prepare('UPDATE bookmarks SET title_original=COALESCE(NULLIF(title_original,\'\'),?),summary=CASE WHEN ? IS NOT NULL THEN ? ELSE summary END,updated_at=? WHERE id=?')
        .bind(title,summary,summary,new Date().toISOString(),item.id).run();
    }
    return json({...report,proposed:{title_original:title,summary},updated:body.apply===true&&!!(title||summary)});
  }
  if(p==='/bookmarks/api/admin/ingest-token'&&req.method==='POST')return json(await rotateIngestToken(env.DB));
  if(p==='/bookmarks/api/admin/tags'&&req.method==='GET')return json(await tagsList(env.DB,true));
  const tagMatch=p.match(/^\/bookmarks\/api\/admin\/tags\/([^/]+)\/?$/);
  if(tagMatch&&req.method==='PATCH'){
   const changed=await renameTag(env.DB,decodeURIComponent(tagMatch[1]),await input(req));
   return changed?json(changed):json({error:'找不到標籤'},404);
  }
  if(p==='/bookmarks/api/admin/check'&&req.method==='GET'){
   const target=url.searchParams.get('url');return json(target?await byUrl(env.DB,target):null);
  }
  const match=p.match(/^\/bookmarks\/api\/admin\/([0-9a-f-]{36})\/?$/);
  if(match){
   if(req.method==='GET')return json(await get(env.DB,match[1],true));
   if(req.method==='PATCH')return json(await patch(env.DB,match[1],await input(req)));
   if(req.method==='DELETE')return json({deleted:await remove(env.DB,match[1])});
  }
  if(p==='/bookmarks/api/ingest/status'&&req.method==='POST')return bulkStatus(req,env);
  if(p==='/bookmarks/api/ingest/remove'&&req.method==='POST'){
   if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
   const body=await input(req),item=await byUrl(env.DB,body.url);
   if(!item)return json({deleted:false});
   return json({deleted:await remove(env.DB,item.id)});
  }
  if(p==='/bookmarks/api/ingest/update-tags'&&req.method==='POST')return updateTags(req,env);
  if(p==='/bookmarks/api/ingest/tags'&&req.method==='GET'){
   if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
   return json(await tagsList(env.DB,true));
  }
  if(p==='/bookmarks/api/ingest'&&req.method==='POST'){
   const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
   if(!await validIngestToken(req,env))return json({error:'無效的新增 Token'},401);
   return json(await create(env.DB,{...await input(req),source:'tampermonkey'}),201);
  }
  if((p==='/bookmarks/api'||p==='/bookmarks/api/')&&req.method==='GET')return json(await list(env.DB,opts(url)));
  if(p==='/bookmarks/api/tags'&&req.method==='GET')return json(await tagsList(env.DB));
  return json({error:'不存在的 API'},404);
 }catch(e){const bad=e instanceof TypeError||e instanceof SyntaxError||/網址|標題|摘要|標籤|分類|JSON|狀態|資料過大|格式|HTTP/.test(String(e.message));return json({error:bad?e.message:'伺服器錯誤'},bad?400:500);}
}
