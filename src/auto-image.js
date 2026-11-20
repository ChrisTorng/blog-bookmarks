import {safeArticleUrl} from './auto-summary.js';
import {normalizeImageUrl,get} from './data.js';

// A one-time, conservative publisher-image lookup. Only store an HTTPS URL;
// never copy remote files into D1 or overwrite a person's own choice.
const clean = value => String(value||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();
export function readSocialImages(html,articleUrl){
 const metas={};
 for(const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)){
  const attrs={};
  for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
   attrs[m[1].toLowerCase()]=clean(m[2]??m[3]??m[4]);
  const name=(attrs.property||attrs.name||'').toLowerCase();
  if(name&&attrs.content&&!(name in metas))metas[name]=attrs.content;
 }
 const raw=metas['og:image:secure_url']||metas['og:image']||metas['twitter:image']||'';
 let image;
 try{ image=normalizeImageUrl(new URL(raw,articleUrl).href); }catch{return null;}
 if(!safeArticleUrl(image)||/(?:favicon|(?:site|brand)[-_.]?logo|avatar|placeholder|spacer|pixel|transparent\.gif)/i.test(new URL(image).pathname))return null;
 const width=Number(metas['og:image:width']||0),height=Number(metas['og:image:height']||0);
 if((width&&width<260)||(height&&height<125))return null;
 const title=metas['og:title']||'';
 if(/^(?:just a moment|access denied|sign in|captcha|login|404|403)/i.test(title))return null;
 return {image_url:image,source_title:title,width,height,canonical:metas['og:url']||''};
}
function samePath(a,b){
 try{const x=new URL(a),y=new URL(b);
  return x.hostname.replace(/^www\./,'')===y.hostname.replace(/^www\./,'')
    && x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'');
 }catch{return false;}
}
function similarTitle(a,b){
 const word=s=>new Set(String(s||'').toLowerCase().match(/[a-z0-9]{4,}/g)||[]);
 const left=word(a),right=word(b);
 if(left.size<2||right.size<2)return false;
 return [...left].filter(x=>right.has(x)).length>=Math.min(2,left.size);
}
async function pageSource(item,fetcher){
 for(const value of [...new Set([item.url,item.redirect_url].filter(Boolean))]){
  const url=safeArticleUrl(value);if(!url)continue;
  try{
   const res=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(7000)});
   if(!res.ok||!/(?:text\/html|application\/xhtml\+xml)/i.test(res.headers.get('content-type')||''))continue;
   if(Number(res.headers.get('content-length')||0)>1500000)continue;
   const reader=res.body?.getReader(),decoder=new TextDecoder();
   let html='',size=0;
   if(reader){try{while(size<350000){
    const {done,value}=await reader.read();if(done)break;
    const chunk=value.slice(0,350000-size);size+=chunk.byteLength;
    html+=decoder.decode(chunk,{stream:true});if(chunk.length!==value.length)break;
   }}finally{await reader.cancel().catch(()=>{});}}
   else html=(await res.text()).slice(0,350000);
   const candidate=readSocialImages(html,url);
   if(!candidate)continue;
   if(candidate.canonical&&!samePath(url,new URL(candidate.canonical,url).href))continue;
   // Avoid cross-article generic preview cards. Chinese titles are not a
   // reliable literal match for their original English titles.
   const expected=item.title_original||item.title||'';
   if(candidate.source_title&&/[a-z]{4,}/i.test(expected) &&
      !similarTitle(candidate.source_title,expected)&&
      candidate.width===0&&candidate.height===0)continue;
   return candidate;
  }catch(error){console.warn('Bookmark image metadata unavailable',String(error).slice(0,200));}
 }
 return null;
}
export async function selectPublisherImage(env,item,fetcher=fetch){
 const candidate=await pageSource(item,fetcher);
 if(!candidate)return null;
 // Small site icons and low-resolution placeholders are never accepted.
 // When the vision model responds, it has priority over metadata heuristics.
 if(env.AI){
  try{
   const prompt='Article title: '+String(item.title_original||item.title||'').slice(0,180)+
     '. Article summary: '+String(item.summary||'').slice(0,400)+
     '. Does the supplied picture meaningfully illustrate this article (photo, chart, graphic or illustrative artwork), rather than a generic website logo, unrelated ad, avatar or placeholder? Answer YES or NO only.';
   const result=await env.AI.run('@cf/moondream/moondream3.1-9B-A2B',{
    task:'query',image:candidate.image_url,question:prompt,reasoning:false,max_tokens:70
   });
   const verdict=String(result?.answer||'').trim().toUpperCase();
   if(/^NO\b/.test(verdict))return null;
   if(/^YES\b/.test(verdict))return candidate.image_url;
  }catch(error){console.warn('Bookmark image visual comparison unavailable',String(error).slice(0,200));}
 }
 // Graceful degradation when vision is unavailable: only a large, explicitly
 // article-associated social card is eligible, not an unverified site icon.
 if(candidate.width>=260&&candidate.height>=125)return candidate.image_url;
 if(candidate.source_title&&similarTitle(candidate.source_title,item.title_original||item.title))
  return candidate.image_url;
 return null;
}
export async function autoCompleteImage(env,item,fetcher=fetch){
 if(!item?.id||item.image_url)return {saved:false,reason:'already-has-image'};
 const image=await selectPublisherImage(env,item,fetcher).catch(error=>{
  console.warn('Bookmark fallback image lookup failed',String(error));return null;
 });
 const now=new Date().toISOString();
 const sql=image
  ?"UPDATE bookmarks SET image_url=?,image_checked_at=? WHERE id=? AND (image_url IS NULL OR image_url='') AND image_suppressed=0"
  :"UPDATE bookmarks SET image_checked_at=? WHERE id=? AND (image_url IS NULL OR image_url='') AND image_suppressed=0";
 const result=image
  ?await env.DB.prepare(sql).bind(image,now,item.id).run()
  :await env.DB.prepare(sql).bind(now,item.id).run();
 return {saved:!!image&&!!result.meta?.changes,image_url:result.meta?.changes?image:null,reason:image?'image-found':'no-suitable-image'};
}
export async function backfillMissingImages(env,limit=8){
 const max=Math.max(1,Math.min(10,Number(limit)||8));
 const rows=(await env.DB.prepare(`SELECT id FROM bookmarks
  WHERE (image_url IS NULL OR image_url='') AND image_suppressed=0
  AND (image_checked_at IS NULL OR image_checked_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'))
  ORDER BY image_checked_at IS NOT NULL,created_at ASC LIMIT ?`).bind(max).all()).results||[];
 let saved=0,checked=0;
 for(const row of rows){
  const item=await get(env.DB,row.id,true);
  if(!item||item.image_url)continue;
  try{const result=await autoCompleteImage(env,item);checked++;if(result.saved)saved++;}
  catch(error){console.warn('Scheduled bookmark image enrichment failed',row.id,String(error));}
 }
 console.log('Bookmark image enrichment',JSON.stringify({checked,saved}));
 return {checked,saved};
}
