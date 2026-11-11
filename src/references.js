import {normalUrl} from './data.js';
import {inspect,sameArticle,trustedTitle} from './metadata.js';

// Never suggest a discussion by approximate title. Only an exact source URL match
// may create a Hacker News reference, with the most-discussed exact thread preferred.
export async function findHnDiscussion(urls,transport=fetch) {
  const sources=[...new Set(urls.filter(Boolean).map(value=>normalUrl(value)))];
  let best=null;
  for(const source of sources){
    const u=new URL(source);
    if(u.hostname==='news.ycombinator.com' && u.pathname==='/item'
      && /^[0-9]+$/.test(u.searchParams.get('id')||'')) {
      const id=u.searchParams.get('id');
      const response=await transport('https://hacker-news.firebaseio.com/v0/item/'+id+'.json');
      const item=response.ok?await response.json():null;
      if(item?.id===Number(id) && item.type==='story')
        return {url:'https://news.ycombinator.com/item?id='+id,
          title:String(item.title||'Hacker News 留言').slice(0,500),kind:'hacker-news'};
      continue;
    }
    const query=new URL('https://hn.algolia.com/api/v1/search');
    query.searchParams.set('query',u.hostname+u.pathname);
    query.searchParams.set('tags','story');
    query.searchParams.set('hitsPerPage','100');
    const response=await transport(query.href);
    if(!response.ok)continue;
    const hits=(await response.json()).hits||[];
    for(const hit of hits){
      if(!hit.url || !sameArticle(source,hit.url) || !/^[0-9]+$/.test(String(hit.objectID||'')))continue;
      const comments=Number(hit.num_comments)||0,points=Number(hit.points)||0;
      if(!best || comments>best.comments || (comments===best.comments&&points>best.points))
        best={id:String(hit.objectID),title:hit.title,comments,points};
    }
  }
  return best?{url:'https://news.ycombinator.com/item?id='+best.id,
    title:trustedTitle(String(best.title||''))?best.title:'Hacker News 留言',kind:'hacker-news'}:null;
}

export async function lookupReference(raw,transport=fetch) {
  if(!raw||typeof raw!=='object')throw Error('參考網址格式無效');
  const url=normalUrl(String(raw.url||'').trim());
  if(url.length>4096)throw Error('參考網址過長');
  if(raw.type==='hn'){
    const candidates=[url];
    if(raw.redirect_url){
      try{candidates.push(normalUrl(raw.redirect_url))}catch{}
    }
    const found=await findHnDiscussion(candidates,transport);
    return {found:!!found,reference:found};
  }
  if(raw.type!=='title')throw Error('參考網址查詢類型無效');
  const u=new URL(url);
  if(u.hostname==='news.ycombinator.com' && u.pathname==='/item'){
    const hn=await findHnDiscussion([url],transport);
    if(hn)return {found:true,reference:hn};
  }
  // inspect() only fetches publicly addressable HTTPS hosts, without following
  // redirects or trusting mismatched canonical URLs.
  const info=await inspect(url,transport);
  const title=info?.title||u.hostname;
  return {found:!!info,reference:{url,title,kind:'link'}};
}
