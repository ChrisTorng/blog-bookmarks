import { esc } from './data.js';
import { bookmarkArticleHtml, bookmarkPermalink, bookmarkTags } from './public-content.js';

const siteTitle = 'ChrisTorng 學習天地';
const publicDay = (item) => (item.status_at || item.published_at || item.created_at).slice(0, 10);

// Public records deliberately contain only Taiwan-local calendar dates; precise reading/
// publishing times are private. Give same-day entries monotonic synthetic seconds so
// RSS clients can sort them without disclosing when the owner processed a bookmark.
function publicationDates(items) {
 const remaining = new Map();
 for (const item of items) {
  const day = publicDay(item);
  remaining.set(day, (remaining.get(day) || 0) + 1);
 }
 return items.map((item) => {
  const day = publicDay(item);
  const rank = remaining.get(day);
  remaining.set(day, rank - 1);
  const baseline = Date.parse(day + 'T00:00:00+08:00');
  return new Date(baseline + Math.min(rank, 86399) * 1000).toUTCString();
 });
}


export function rss(items, siteUrl, tag = '', tagLabel = '', categories = [], noteHtmlById = {}) {
 const base = siteUrl.replace(/\/$/, '');
 const section = tag ? (tagLabel || tag) + ' · 書籤' : '所有書籤';
 const title = section + ' RSS | ' + siteTitle;
 const feedLink = base + '/bookmarks/' + (tag ? '?tag=' + encodeURIComponent(tag) : '');
 const dates = publicationDates(items);
 return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>'
  + '<title>' + esc(title) + '</title><link>' + esc(feedLink) + '</link>'
  + '<description>ChrisTorng 分享的書籤</description><language>zh-TW</language>'
  + items.map((item, index) => {
   const url = base + bookmarkPermalink(item);
   const content = bookmarkArticleHtml(item, categories, noteHtmlById[item.id]);
   const labels = bookmarkTags(item, categories);
   // New feed is not public yet: canonical permalink is the RSS GUID.
   return '<item><title>' + esc(item.title) + '</title><link>' + esc(url) + '</link>'
    + '<guid isPermaLink="true">' + esc(url) + '</guid><pubDate>' + dates[index] + '</pubDate>'
    + labels.map(t => '<category>' + esc(t.name) + '</category>').join('')
    + '<description>' + esc(content) + '</description>'
    + '<content:encoded><![CDATA[' + content.replaceAll(']]>', ']]]]><![CDATA[>') + ']]></content:encoded>'
    + '</item>';
  }).join('') + '</channel></rss>';
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
