// Admin-only inspection; never called while a bookmark is saved.
export function invalidSummary(s) {
  const text=String(s||'').trim();
  return !text||text.length<15||/^(?:抱歉|sorry)$/i.test(text)||
    /(?:請確保.{0,20}瀏覽器|啟用.{0,15}JavaScript|沒有權限存取|請登入.{0,20}帳號|協助.{0,20}help\.ft\.com|access denied|verify you are human|captcha|rate limit exceeded)/i.test(text);
}
const clean=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
export function metadata(html) {
  const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
  function find(name) {
    const tag=tags.find(t=>t.includes('property="'+name+'"')||t.includes('name="'+name+'"'));
    return tag?.match(/content=["']([^"']*)["']/i)?.[1]||'';
  }
  return {title:clean(find('og:title')||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    description:clean(find('og:description')||find('description')), originalUrl:clean(find('og:url'))};
}
export function sameArticle(a,b) {
  try {const x=new URL(a),y=new URL(b);return x.hostname===y.hostname&&x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'')&&x.search===y.search;}
  catch{return false;}
}
export function trustedTitle(title) {
  return title.length>=5&&title.length<=500&&!/^(?:home|welcome|sign in|login|access denied|403|404|just a moment)/i.test(title);
}

export async function inspect(url,fetcher=fetch) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!parsed.hostname.includes('.')||parsed.username||parsed.password||parsed.port||/^(?:localhost|[0-9.]+)$/.test(parsed.hostname)||/\.(?:local|internal|test|localhost)$/.test(parsed.hostname))return null;
  const res=await fetcher(url,{redirect:'manual'});
  if(!res.ok||!(res.headers.get('Content-Type')||'').includes('text/html'))return null;
  const data=metadata((await res.text()).slice(0,1000000));
  return trustedTitle(data.title)?data:null;
}

export async function hnExact(url,fetcher=fetch) {
  const u=new URL(url);
  if(u.hostname==='news.ycombinator.com'&&u.pathname==='/item'){
    const id=u.searchParams.get('id');
    if(!/^[0-9]+$/.test(id||''))return null;
    const r=await fetcher('https://hacker-news.firebaseio.com/v0/item/'+id+'.json');
    const x=r.ok?await r.json():null;
    return x?.id===Number(id)&&trustedTitle(x.title||'')?{title:x.title,source:'hn-item-id'}:null;
  }
  const q=new URL('https://hn.algolia.com/api/v1/search');
  q.searchParams.set('query',u.hostname+u.pathname);
  q.searchParams.set('tags','story');
  q.searchParams.set('hitsPerPage','50');
  const r=await fetcher(q.href);
  if(!r.ok)return null;
  const matches=((await r.json()).hits||[]).filter(x=>x.url&&sameArticle(url,x.url)&&trustedTitle(x.title||''));
  return matches.length===1?{title:matches[0].title,source:'hn-exact-url'}:null;
}

export async function review(item,transport=fetch) {
  let publisher=null,hn=null,archive=null,betaCat=null;
  try {publisher=await inspect(item.url,transport);}catch{}
  try {hn=await hnExact(item.url,transport);}catch{}
  try {
    const target=new URL(item.redirect_url);
    if(!publisher && ['archive.is','archive.ph','web.archive.org'].includes(target.hostname) &&
       !target.pathname.startsWith('/submit/')){
      const page=await inspect(target.href,transport);
      if(page && page.originalUrl && sameArticle(item.url,page.originalUrl))archive=page;
    }
  }catch{}
  if(!hn && !publisher && !archive){try{betaCat=await betaCatExact(item,transport);}catch{}}
  const title=hn?.title||publisher?.title||archive?.title||betaCat?.title||null;
  const description=publisher?.description||archive?.description||null;
  return {verified:!!title,title_original:title,
    source:hn?.source||(publisher?'publisher-exact-url':archive?'archive-exact-url':betaCat?.source||null),
    summary:description&&!invalidSummary(description)?description:null,
    invalid_existing_summary:invalidSummary(item.summary)};
}

export async function betaCatExact(item,transport=fetch) {
  if(!item.created_at)return null;
  const t=Date.parse(item.created_at);
  if(!Number.isFinite(t))return null;
  const dates=[0,-1,-2,-3].map(n=>new Date(t+n*86400000).toISOString().slice(0,10));
  for(const date of dates){
    try{
      const page=await transport('https://hackernews.betacat.io/daily/'+date+'/',{redirect:'manual'});
      if(!page.ok)continue;
      const html=(await page.text()).slice(0,1500000);
      const links=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
      const matching=links.filter(m=>m[1].includes('post-url')).filter(m=>{
        const url=m[1].match(/href=["']([^"']+)["']/)?.[1];
        return url&&sameArticle(item.url,url.replace(/&amp;/g,'&'));
      });
      if(matching.length!==1)continue;
      const title=clean(matching[0][2]);
      if(trustedTitle(title))return {title,source:'betacat-exact-url',date};
    }catch{}
  }
  return null;
}
