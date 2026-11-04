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
    const tag=tags.find(t=>new RegExp('(?:name|property)=["\\']'+name+'["\\']','i').test(t));
    return tag?.match(/content=["']([^"']*)["']/i)?.[1]||'';
  }
  return {title:clean(find('og:title')||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    description:clean(find('og:description')||find('description'))};
}
export function sameArticle(a,b) {
  try {const x=new URL(a),y=new URL(b);return x.hostname===y.hostname&&x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'');}
  catch{return false;}
}
export function trustedTitle(title) {
  return title.length>=5&&title.length<=500&&!/^(?:home|welcome|sign in|login|access denied|403|404|just a moment)/i.test(title);
}

export async function inspect(url,fetcher=fetch) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!parsed.hostname.includes('.')||parsed.username||parsed.password) return null;
  const res=await fetcher(url,{redirect:'manual'});
  if(!res.ok||!(res.headers.get('Content-Type')||'').includes('text/html'))return null;
  const data=metadata((await res.text()).slice(0,1000000));
  return trustedTitle(data.title)?data:null;
}
