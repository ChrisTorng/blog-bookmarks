import { esc } from './data.js';
export function rss(items,siteUrl,tag='',tagLabel=''){
 const base=siteUrl.replace(/\/$/,'');
 const title=(tag ? (tagLabel||tag) : '全部')+'書籤 RSS 訂閱';
 const feedLink=base+'/bookmarks/'+(tag?'?tag='+encodeURIComponent(tag):'');
 return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>'+esc(title)+'</title><link>'+esc(feedLink)+'</link><description>ChrisTorng 分享的書籤</description><language>zh-TW</language>'+items.map(b=>'<item><title>'+esc(b.title)+'</title><link>'+esc(b.preferred_url||b.redirect_url||b.url)+'</link><guid isPermaLink="true">'+base+'/bookmarks/'+esc(b.id)+'/</guid><pubDate>'+new Date(b.status_at||b.published_at||b.created_at).toUTCString()+'</pubDate><description>'+esc(b.summary||'')+'</description></item>').join('')+'</channel></rss>';
}
export async function shellPage(response,env){
 if(!env.BLOG_SHELL_URL)return response;
 const original=await response.text(),main=original.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1],head=original.match(/<head>([\s\S]*?)<\/head>/)?.[1];
 if(main===undefined||!head)return new Response('Page error',{status:500});
 try{
  const r=await fetch(env.BLOG_SHELL_URL,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('shell');
  const markup=await r.text();if(!markup.includes('id="notes-content"'))throw Error('slot');
  let w=new HTMLRewriter().on('#notes-content',{element(el){el.setInnerContent('<section class="notes-public bookmarks-public">'+main+'</section>',{html:true});}});
  for(const selector of ['title','meta[name="description"]','meta[name="robots"]','link[rel="canonical"]'])w=w.on('head '+selector,{element(el){el.remove();}});
  w=w.on('head',{element(el){el.append(head,{html:true});}});
  return w.transform(new Response(markup,{status:response.status,headers:response.headers}));
 }catch{return new Response('主站版型暫時無法取得',{status:503,headers:{'Cache-Control':'no-store'}});}
}
