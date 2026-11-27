import {isAdmin,safeOrigin,sameToken} from './auth.js';
import {suggestBookmarkTags,mergeBookmarkTags} from './classify.js';
import {bulkStatus,updateTags} from './ingest.js';
import {review,invalidSummary} from './metadata.js';
import {lookupReference} from './references.js';
import {needsSummaryRepair,repairCandidates,readSubmittedContent,commitArticleSummary,summarizeSubmittedArticle} from './summary-repair.js';
import {autoReviewNewSummary} from './auto-summary.js';
import {autoCompleteImage,backfillMissingImages} from './auto-image.js';
import {triageList,scoreTriage,inspectTriage,countText} from './triage.js';
import {previewInsights} from './preview.js';
import {readingRequest,readingStreamResponse,attachReading,cachedBrowserBody} from './reading.js';
import {validIngestToken,rotateIngestToken} from './token.js';
import {list,get,byUrl,create,patch,remove,tagsList,renameTag,reviewWindow,createAndAttachTag} from './data.js';
import {bookmarkArticleHtml,bookmarkPermalink} from './public-content.js';
import {relatedNoteHtml} from './note-references.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
// A public bookmark may also appear in Notes/RSS; invalidate both Workers.
async function invalidateAfterWrite(env,ctx) {
 if(env.AUTH_MODE==='local')return;
 try {
  if(!ctx?.exports?.PublicCache?.purgePublic || !env.NOTE_REFERENCES?.invalidatePublic)
   throw new Error('Public cache invalidation entrypoint missing');
  await ctx.exports.PublicCache.purgePublic();
  await env.NOTE_REFERENCES.invalidatePublic();
 } catch(error) {
  console.error('Bookmark saved but public cache purge failed',String(error));
  const failure=new Error('書籤已儲存，但公開快取尚未全部更新；請稍後重新整理或再次儲存。');
  failure.httpStatus=503;failure.code='PUBLIC_CACHE_PURGE_FAILED';
  failure.publicMessage=failure.message;failure.saved=true;
  throw failure;
 }
}
export function opts(url,privateList=false){
 const filter=url.searchParams.get('filter')||(privateList?'pending':'published');
 const defaultSort=privateList&&['pending','unread','readPending','deferred'].includes(filter)?'old':'new';
 return {privateList,filter,tag:url.searchParams.get('tag')||'',page:url.searchParams.get('page')||1,sort:url.searchParams.get('sort')||defaultSort,q:url.searchParams.get('q')||'',from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||''};
}
async function input(req){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw Error('需要 JSON 格式');
 const length=Number(req.headers.get('Content-Length')||0);if(length>100000)throw Error('資料過大');
 const str=await req.text();if(str.length>100000)throw Error('資料過大');
 return JSON.parse(str);
}
async function createCategorized(env,raw,ctx) {
  // Check duplicates before spending inference or altering an existing manual decision.
  const exists=await byUrl(env.DB,raw.url);
  if(exists)return {item:exists,alreadyExists:true};
  let inferred=[];
  try {
    inferred=await suggestBookmarkTags(env,raw);
  }catch(error){
    console.warn('Bookmark auto-categorization failed',String(error));
  }
  // Preserve manual tags. The placeholder allows the user to revisit AI failures.
  const tags=mergeBookmarkTags(raw.tags,inferred);
  const saved=await create(env.DB,{...raw,tags:tags.length?tags:['default']});
  if(!saved.alreadyExists&&!saved.item.image_url&&ctx?.waitUntil){
    ctx.waitUntil(autoCompleteImage(env,saved.item).catch(e=>console.warn('New bookmark image enrichment failed',String(e))));
  }
  if(!saved.alreadyExists&&ctx?.waitUntil&&(env.AI||needsSummaryRepair(saved.item.summary))){
    ctx.waitUntil(autoReviewNewSummary(env,saved.item).catch(e=>console.warn('New bookmark summary review failed',String(e))));
  }
  return saved;
}
export async function api(req,env,url,ctx){
 const p=url.pathname;
 const privateApi=p==='/bookmarks/api/admin'||p.startsWith('/bookmarks/api/admin/');
 if(privateApi && !await isAdmin(req,env))return json({error:'未經管理員驗證'},401);
 if(!p.startsWith('/bookmarks/api/ingest') && !safeOrigin(req)&&!['GET','HEAD'].includes(req.method))return json({error:'Origin 不符'},403);
 try{
  if(p==='/bookmarks/api/admin'||p==='/bookmarks/api/admin/'){
   if(req.method==='GET'){const result=await list(env.DB,opts(url,true));return json({...result,items:await attachReading(env.DB,result.items)});}
   if(req.method==='POST')return json(await createCategorized(env,await input(req),ctx),201);
  }
  if(p==='/bookmarks/api/admin/triage'&&req.method==='GET')
    return json(await triageList(env.DB,url.searchParams.get('deferred')==='1'));
  if(p==='/bookmarks/api/admin/triage/score'&&req.method==='POST'){
    const body=await input(req);
    return json(await scoreTriage(env,body.ids));
  }
  if(p==='/bookmarks/api/admin/triage/inspect'&&req.method==='POST'){
    const body=await input(req);
    const report=await inspectTriage(env,String(body.id||''));
    if(!report.available)return json(report);
    try{
      const scored=await scoreTriage(env,[String(body.id)],{fullText:report});
      const {text,...metrics}=report;
      return json({...metrics,analysis:scored.updated[0]?.analysis});
    }catch(error){
      const {text,...metrics}=report;
      return json({...metrics,score_error:String(error?.message||error)});
    }
  }
  if(p==='/bookmarks/api/admin/triage/paste'&&req.method==='POST'){
    const body=await readSubmittedContent(req);
    const text=body.content.trim();
    if(text.length<300)throw Error('請提供至少 300 字元的文章正文');
    const report={source:'pasted-text',...countText(text),text:text.slice(0,50000)};
    const scored=await scoreTriage(env,[body.id],{fullText:report});
    const {text:unused,...metrics}=report;
    return json({available:true,...metrics,analysis:scored.updated[0]?.analysis});
  }
  if(p==='/bookmarks/api/admin/image/backfill'&&req.method==='POST'){
    const body=await input(req);
    const updated=await backfillMissingImages(env,Math.min(10,Math.max(1,Number(body.limit)||5)));
    if(updated?.saved>0)await invalidateAfterWrite(env,ctx);
    return json(updated);
  }
  if(p==='/bookmarks/api/admin/quick'&&req.method==='GET'){
    const result=await reviewWindow(env.DB,url.searchParams.get('size'));
    const groups=['recent','pending','deferred'];const all=await attachReading(env.DB,groups.flatMap(k=>result[k]||[]));
    const byId=new Map(all.map(x=>[x.id,x]));
    for(const k of groups)result[k]=(result[k]||[]).map(x=>byId.get(x.id));
    return json(result);
  }
  if(p==='/bookmarks/api/admin/summary-repair'){
    if(req.method==='GET')return json(await repairCandidates(env.DB));
    if(req.method==='POST'){
      const body=await readSubmittedContent(req,{allowDescription:true});
      const updated=await commitArticleSummary(env,body.id,body);
      await invalidateAfterWrite(env,ctx);
      return json(updated);
    }
  }
  if(p==='/bookmarks/api/admin/summary-repair/from-reading' && req.method==='POST'){
    const body=await input(req);
    if(!/^[0-9a-f-]{36}$/i.test(String(body.id||'')))return json({error:'書籤 ID 無效'},400);
    const item=await get(env.DB,body.id,true);
    if(!item)return json({error:'書籤不存在'},404);
    if([3,4].includes(item.status)||!needsSummaryRepair(item.summary))return json({saved:false,summary:item.summary});
    const content=await cachedBrowserBody(env.DB,item.normalized_url||item.url);
    if(!content)return json({saved:false,reason:'no-body'});
    return json(await commitArticleSummary(env,item.id,{content}));
  }
  if(p==='/bookmarks/api/admin/summary-repair/clear' && req.method==='POST'){
    const body=await input(req);
    if(!/^[0-9a-f-]{36}$/i.test(String(body.id||''))||typeof body.summary!=='string')
      return json({error:'書籤或摘要無效'},400);
    const result=await env.DB.prepare(
      "UPDATE bookmarks SET summary=NULL,updated_at=? WHERE id=? AND stage IN (0,1,2) AND summary IS ?"
    ).bind(new Date().toISOString(),body.id,body.summary).run();
    if(!result.meta.changes)return json({error:'摘要或公開狀態已變更，請重新整理'},409);
    return json({id:body.id,summary:null,saved:true});
  }
  if(p==='/bookmarks/api/admin/summary-repair/preview' && req.method==='POST'){
    const body=await readSubmittedContent(req);
    const item=await get(env.DB,body.id,true);
    if(!item)return json({error:'書籤不存在'},404);
    return json({summary:await summarizeSubmittedArticle(env,item,body.content),saved:false});
  }
  if(p==='/bookmarks/api/admin/reference/lookup' && req.method==='POST'){
    return json(await lookupReference(await input(req)));
  }
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
    if(body.apply===true&&(title||summary))await invalidateAfterWrite(env,ctx);
    return json({...report,proposed:{title_original:title,summary},updated:body.apply===true&&!!(title||summary)});
  }
  if(p==='/bookmarks/api/admin/ingest-token'&&req.method==='POST')return json(await rotateIngestToken(env.DB));
  if(p==='/bookmarks/api/admin/tags'&&req.method==='GET')return json(await tagsList(env.DB,true));
  if(p==='/bookmarks/api/admin/tags'&&req.method==='POST'){
    const created=await createAndAttachTag(env.DB,await input(req));
    if(created.item?.status>=3)await invalidateAfterWrite(env,ctx);
    return json(created,201);
  }
  const tagMatch=p.match(/^\/bookmarks\/api\/admin\/tags\/([^/]+)\/?$/);
  if(tagMatch&&req.method==='PATCH'){
   const changed=await renameTag(env.DB,decodeURIComponent(tagMatch[1]),await input(req));
   if(changed)await invalidateAfterWrite(env,ctx);
   return changed?json(changed):json({error:'找不到標籤'},404);
  }
  if(p==='/bookmarks/api/admin/check'&&req.method==='GET'){
   const target=url.searchParams.get('url');return json(target?await byUrl(env.DB,target):null);
  }
  const match=p.match(/^\/bookmarks\/api\/admin\/([0-9a-f-]{36})\/?$/);
  if(match){
   if(req.method==='GET'){const item=await get(env.DB,match[1],true);return json(item?(await attachReading(env.DB,[item]))[0]:null);}
   if(req.method==='PATCH'){
    const id=match[1];
    const item=await patch(env.DB,id,await input(req),
      () => env.NOTE_REFERENCES?.hasReference(id),env.AI);
    if(item&&(item.status>=3||item._wasPublic))await invalidateAfterWrite(env,ctx);
    return json(item);
   }
   if(req.method==='DELETE'){
    const deleted=await remove(env.DB,match[1]);
    if(deleted)await invalidateAfterWrite(env,ctx);
    return json({deleted});
   }
  }
  if(p==='/bookmarks/api/ingest/reading'&&req.method==='POST'){
    if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
    if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw Error('需要 JSON 格式');
    if(Number(req.headers.get('Content-Length')||0)>1100000)throw Error('資料過大');
    const text=await req.text();if(text.length>1000000)throw Error('資料過大');
    const raw=JSON.parse(text);
    if(raw.stream===true&&['manual','prepare','capture'].includes(raw.mode))return readingStreamResponse(env,raw,ctx);
    const result=await readingRequest(env,raw,ctx);
    // A verified browser capture can repair an empty/invalid ordinary summary.
    // Never replace a valid short summary or spend the deep-reading budget.
    if(raw.mode==='store'&&result.body_changed&&result.has_body&&ctx?.waitUntil&&env.AI){
      ctx.waitUntil((async()=>{
        const item=await byUrl(env.DB,result.url);
        if(!item||![0,1,5].includes(item.status)||!needsSummaryRepair(item.summary))return;
        const content=await cachedBrowserBody(env.DB,result.url);
        if(content)await commitArticleSummary(env,item.id,{content});
      })().catch(error=>console.warn('Browser short summary fallback:',String(error))));
    }
    return json(result);
  }
  if(p==='/bookmarks/api/ingest/preview'&&req.method==='POST'){
    if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
    return json(await previewInsights(env,await input(req),ctx));
  }
  if(p==='/bookmarks/api/ingest/status'&&req.method==='POST'){
    const result=await bulkStatus(req,env);
    if(result.ok && result.headers.get('X-Public-Content-Changed')==='1')await invalidateAfterWrite(env,ctx);
    return result;
  }
  if(p==='/bookmarks/api/ingest/remove'&&req.method==='POST'){
   if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
   const body=await input(req),item=await byUrl(env.DB,body.url);
   if(!item)return json({deleted:false});
   const deleted=await remove(env.DB,item.id);
   if(deleted)await invalidateAfterWrite(env,ctx);
   return json({deleted});
  }
  if(p==='/bookmarks/api/ingest/update-tags'&&req.method==='POST'){
    const result=await updateTags(req,env);
    if(result.ok && result.headers.get('X-Public-Content-Changed')==='1')await invalidateAfterWrite(env,ctx);
    return result;
  }
  if(p==='/bookmarks/api/ingest/tags'&&req.method==='GET'){
   if(!await validIngestToken(req,env))return json({error:'Token 無效'},401);
   return json(await tagsList(env.DB,true));
  }
  if(p==='/bookmarks/api/ingest'&&req.method==='POST'){
   const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
   if(!await validIngestToken(req,env))return json({error:'無效的新增 Token'},401);
   return json(await createCategorized(env,{...await input(req),source:'tampermonkey'},ctx),201);
  }
  // Public, live HTML representation used by Notes permalink and RSS.
  // A private/deleted bookmark is never exposed by the embed endpoint.
  const embed=p.match(/^\/bookmarks\/api\/embed\/([0-9a-f-]{36})\/?$/);
  if(embed && req.method==='GET'){
    const showReading=url.searchParams.get('reading')!=='0';
    const item=await get(env.DB,embed[1],false,showReading);
    if(!item)return json({error:'書籤未公開或不存在'},404);
    const categories=await tagsList(env.DB);
    return new Response(bookmarkArticleHtml(item,categories,'',bookmarkPermalink(item),false,{showReading}),{
      headers:{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
    });
  }
  const publicDetail=p.match(/^\/bookmarks\/api\/([0-9a-f-]{36})\/?$/);
  if(publicDetail && req.method==='GET'){
    const item=await get(env.DB,publicDetail[1]);
    if(!item)return json({error:'書籤不存在'},404);
    const notes=await relatedNoteHtml(env,[item]);
    return json({...item,related_notes_html:notes[item.id]});
  }
  if((p==='/bookmarks/api'||p==='/bookmarks/api/')&&req.method==='GET'){
    const data=await list(env.DB,opts(url));
    const notes=await relatedNoteHtml(env,data.items);
    return json({...data,items:data.items.map(item=>({...item,related_notes_html:notes[item.id]}))});
  }
  if(p==='/bookmarks/api/tags'&&req.method==='GET')return json(await tagsList(env.DB));
  return json({error:'不存在的 API'},404);
 }catch(e){
  // An opaque 500 prevented the administrator from knowing whether the list,
  // tag catalog or publishing operation had failed. Keep internal details in
  // server logs; return a stable route-specific code and Cloudflare Ray ID.
  const endpoint=p==='/bookmarks/api/admin'||p==='/bookmarks/api/admin/'?'ADMIN_LIST'
    :p==='/bookmarks/api/admin/tags'?'ADMIN_TAGS'
    :/^\/bookmarks\/api\/admin\/[0-9a-f-]{36}\/?$/.test(p)?(req.method==='PATCH'?'BOOKMARK_UPDATE':'BOOKMARK_ITEM')
    :p.includes('/triage')?'ADMIN_TRIAGE':'BOOKMARK_API';
  const ray=(req.headers.get('cf-ray')||'').slice(0,80);
  const bad=e instanceof TypeError||e instanceof SyntaxError||
   /網址|標題|摘要|標籤|分類|JSON|狀態|資料過大|格式|HTTP|原文|文章|書籤 ID|已被|模型|片段|Workers AI|參考/.test(String(e?.message));
  const status=e?.httpStatus||(bad?400:500);
  const code=e?.code||endpoint+(status>=500?'_FAILED':'_INVALID');
  console.error('Bookmark API failure',JSON.stringify({code,method:req.method,path:p,ray,message:String(e?.message||e).slice(0,600),stack:String(e?.stack||'').slice(0,1800)}));
  const safeMessage=e?.publicMessage||(status>=500?'伺服器錯誤':String(e?.message||'請求無效'));
  return json({error:safeMessage,code,...(e?.saved?{saved:true}:{}),...(ray?{ray}:{})},status);
 }
}
