import { isAdmin, isLocal } from './auth.js';
import { list, get, tagsList } from './data.js';
import { api, opts } from './api.js';
import { layout, listing, individual, adminPage } from './views.js';
import { rss, shellPage } from './feeds.js';
import { adminJavaScript, adminStylesheet } from './ui-assets.js';

const response=(body,type='text/html; charset=utf-8',status=200)=>new Response(body,{status,headers:{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
const worker={
 async fetch(req,env){
  const url=new URL(req.url),p=url.pathname;
  if(req.method==='HEAD'){const x=await worker.fetch(new Request(req,{method:'GET'}),env);return new Response(null,{status:x.status,headers:x.headers});}
  if(req.method==='OPTIONS')return response('','text/plain',405);
  if(p.startsWith('/bookmarks/api'))return api(req,env,url);
  if(p==='/bookmarks/admin'||p==='/bookmarks/admin/'){
   if(!(isLocal(req) && env.AUTH_MODE==='local') && !await isAdmin(req,env))return response('管理員驗證失敗','text/plain',401);
   return response(adminPage);
  }
  if(p==='/bookmarks/admin.js'||p==='/bookmarks/admin.css'){
   if(env.ASSETS)return env.ASSETS.fetch(req);
   return response(p.endsWith('.css')?adminStylesheet:adminJavaScript,p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  }
  if(req.method!=='GET')return response('Method Not Allowed','text/plain',405);
  try{
   if(p==='/bookmarks'||p==='/bookmarks/'){
    const o=opts(url),[items,tags]=await Promise.all([list(env.DB,o),tagsList(env.DB)]);
    return shellPage(response(listing(items,tags,o)),env);
   }
   if(p==='/bookmarks/feed.xml'){
    const tag=url.searchParams.get('tag')||'';
    const [first,tags]=await Promise.all([list(env.DB,{tag,filter:'published'}),tagsList(env.DB)]);
    const selected=tags.find(t=>t.id===tag);
    const tagLabel=selected?.name_zh||selected?.name||tag;
    const items=[...first.items];
    for(let n=2;n<=Math.min(first.pages,5);n++)items.push(...(await list(env.DB,{tag,filter:'published',page:n})).items);
    return response(rss(items,env.SITE_URL||'https://christorng.idv.tw',tag,tagLabel),'application/rss+xml; charset=utf-8');
   }
   const match=p.match(/^\/bookmarks\/([0-9a-f-]{36})\/?$/);
   if(match){
    const b=await get(env.DB,match[1]);
    return b?shellPage(response(individual(b,await tagsList(env.DB))),env):response('找不到書籤','text/plain',404);
   }
  }catch{return response('伺服器內部錯誤','text/plain',500);}
  return response('Not Found','text/plain',404);
 }
};
export default worker;
