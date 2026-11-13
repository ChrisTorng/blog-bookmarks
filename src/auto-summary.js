import {get} from './data.js';
import {metadata,sameArticle} from './metadata.js';
import {needsSummaryRepair,summarizeSubmittedArticle,wsjQuickSummary} from './summary-repair.js';
import {CLASSIFIER_MODEL} from './classify.js';

// Restrict outbound URLs: no private addresses, credentials, uncommon ports, or
// automatic redirects to a different host. This is also a cost boundary.
export function safeArticleUrl(value) {
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||
     /^(?:localhost|\d+(?:\.\d+){0,3}|\[|0x)/i.test(u.hostname)||
     /\.(?:local|localhost|internal|test|invalid)$/.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
function cleanText(raw,removeChrome=true){
 const html=String(raw||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
   .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
 const body=removeChrome?html.replace(/<(?:nav|footer|header|aside|svg|form)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside|svg|form)>/gi,' '):html;
 return body
  .replace(/<(?:br|p|li|h[1-6]|summary|button)\b[^>]*>|<\/(?:p|li|h[1-6]|div|section|blockquote|summary|button)>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/&#(x[\da-f]+|\d+);/gi,(_,x)=>{const n=x[0].toLowerCase()==='x'?parseInt(x.slice(1),16):Number(x);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';})
  .replace(/&(?:nbsp|amp|lt|gt|quot|apos|rsquo|lsquo|ldquo|rdquo);/gi,x=>({
   '&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&rsquo;':'’','&lsquo;':'‘','&ldquo;':'“','&rdquo;':'”'
  })[x.toLowerCase()]||' ')
  .replace(/[ \t]{2,}/g,' ').replace(/\n\s*\n\s*\n/g,'\n\n').trim();
}
function publisherQuickSummary(html,url){
 for(const [,details] of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)){
  const text=cleanText(details,false);
  const summary=wsjQuickSummary(text+'\nSee more',url);
  if(summary)return summary;
 }
 return wsjQuickSummary(cleanText(html,false),url);
}
export function articleText(html){
 const body=String(html||'').match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||
  String(html||'').match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||
  String(html||'').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||html;
 return cleanText(body).slice(0,16000);
}
async function readLimited(res,max=360000){
 const reader=res.body?.getReader();
 if(!reader)return (await res.text()).slice(0,max);
 const decoder=new TextDecoder(),parts=[];let bytes=0;
 try{
  while(bytes<max){
   const {done,value}=await reader.read();if(done)break;
   const part=value.slice(0,max-bytes);bytes+=part.byteLength;
   parts.push(decoder.decode(part,{stream:true}));
   if(part.byteLength<value.byteLength)break;
  }
 }finally{try{await reader.cancel()}catch{}}
 return parts.join('')+decoder.decode();
}
export async function fetchReadableArticle(item,fetcher=fetch){
 // Try the original publisher first, then the explicitly stored destination.
 const urls=[item.url,item.redirect_url].filter(Boolean);
 const wsj=/^https:\/\/(?:www\.)?wsj\.com\//i.test(item.url);
 let fallbackText='';
 for(const value of [...new Set(urls)]){
  const url=safeArticleUrl(value);if(!url)continue;
  const target=new URL(url);
  if(/^(?:archive\.(?:is|today|ph))$/.test(target.hostname)&&/^\/submit(?:\/|$)/.test(target.pathname))continue;
  try{
   const r=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(4500)});
   if(!r.ok||!/(?:text\/html|application\/xhtml\+xml)/i.test(r.headers.get('content-type')||''))continue;
   if(Number(r.headers.get('content-length')||0)>1000000)continue;
   const html=await readLimited(r,wsj?1000000:360000);
   const meta=metadata(html);
   if(/^(?:just a moment|access denied|verification required|attention required|請稍等|網站安全檢查)/i.test(meta.title))continue;
   const canonical=meta.originalUrl?new URL(meta.originalUrl,url).href:'';
   const isSnapshot=wsj && /^(?:archive\.(?:is|today|ph)|web\.archive\.org)$/.test(new URL(url).hostname);
   const isVerifiedSnapshot=isSnapshot&&sameArticle(item.url,canonical);
   if(isSnapshot?!isVerifiedSnapshot:canonical&&!sameArticle(url,canonical))continue;
   const publisherSummary=wsj&&(sameArticle(item.url,url)||isVerifiedSnapshot)
     ? publisherQuickSummary(html,item.url) : '';
   if(publisherSummary)return {text:'',publisherSummary};
   const text=articleText(html);
   if(text.length>=450&&!needsSummaryRepair(text.slice(0,650))){
    if(!wsj)return {text,publisherSummary:''};
    fallbackText ||= text;
   }
  }catch(error){console.warn('Article extraction unavailable',String(error));}
 }
 return {text:fallbackText,publisherSummary:''};
}
function responseText(result) {
 const value=result?.choices?.[0]?.message?.content??result?.response??'';
 return typeof value==='string'?value:JSON.stringify(value);
}
export async function compareSummaries(env,item,source,oldSummary,newSummary){
 const result=await env.AI.run(CLASSIFIER_MODEL,{
  messages:[
   {role:'system',content:
    '你是文章內容稽核員。只能根據文章標題及提供的來源內文檢查摘要。' +
    '優先判斷是否抓到登入、反爬蟲、CAPTCHA、錯誤、無關頁面、導航頁等。' +
    '若有來源內文，摘要必須符合來源且沒有臆測；若無來源，僅能判斷標題與摘要是否有明顯矛盾，不能推定事實真偽。' +
    '只能回傳 JSON {"winner":"original"|"generated"|"neither","confidence":0.0}。' +
    '有來源時選最符合來源的完整摘要，兩者都不符合才用 neither；沒有來源時，只有明顯錯誤且高度確信才能用 neither，否則保留 original。'},
   {role:'user',content:JSON.stringify({
    title_original:item.title_original||'',title_zh:item.title_zh||item.title,
    source_excerpt:source.slice(0,10000),original:oldSummary.slice(0,2500),generated:newSummary.slice(0,2500)
   })}
  ],
  response_format:{type:'json_object'},chat_template_kwargs:{enable_thinking:false},
  temperature:0,max_tokens:130
 });
 const data=JSON.parse(responseText(result));
 const winner=['original','generated','neither'].includes(data.winner)?data.winner:'original';
 return {winner,confidence:Number(data.confidence)||0};
}
export async function autoReviewNewSummary(env,created,fetcher=fetch){
 // Only new, still-undecided bookmarks. Never replace an edited summary.
 const original=String(created.summary||'').trim();
 let source='',publisherSummary='',generated='';
 try{({text:source,publisherSummary}=await fetchReadableArticle(created,fetcher));}catch(error){console.warn(String(error));}
 if(source&&env.AI){
  try{generated=await summarizeSubmittedArticle(env,created,source,18000);}
  catch(error){console.warn('Automatic summary generation failed',String(error));}
 }
 let replacement=original;
 if(!publisherSummary&&!generated&&!original)return;
 if(publisherSummary)replacement=publisherSummary;
 else if(needsSummaryRepair(original))replacement=generated||'';
 else {
  try{
   const decision=await compareSummaries(env,created,source,original,generated);
   if(decision.winner==='generated'&&generated&&source&&decision.confidence>=0.65)replacement=generated;
   else if(decision.winner==='neither'&&decision.confidence>=0.8)replacement='';
  }catch(error){
   console.warn('Summary semantic quality check unavailable',String(error));
   if(needsSummaryRepair(original))replacement=generated||'';
  }
 }
 if(replacement===original)return;
 const latest=await get(env.DB,created.id,true);
 if(!latest||![0,1].includes(latest.status)||String(latest.summary||'').trim()!==original)return;
 const result=await env.DB.prepare(
  'UPDATE bookmarks SET summary=?,updated_at=? WHERE id=? AND stage IN (0,1) AND COALESCE(summary,\'\')=?'
 ).bind(replacement,new Date().toISOString(),created.id,original).run();
 if(result.meta?.changes)console.log('New bookmark summary quality updated',created.id,replacement?'replaced':'cleared');
}
