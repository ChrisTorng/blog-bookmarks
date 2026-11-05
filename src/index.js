import { list, tagsList } from './data.js';
import { api, opts } from './api.js';
import { rss } from './feeds.js';

// The HTML, JS and CSS live exclusively on GitHub Pages.
// This Worker serves the API and the dynamic RSS feed only.
const reply = (body, type='text/plain; charset=utf-8', status=200) =>
  new Response(body,{status,headers:{
    'Content-Type':type,
    'X-Content-Type-Options':'nosniff',
    'Cache-Control':'no-store'
  }});

const worker = {
 async fetch(req, env) {
  if (req.method === 'HEAD') {
   const response = await worker.fetch(new Request(req,{method:'GET'}),env);
   return new Response(null,{status:response.status,headers:response.headers});
  }
  const url=new URL(req.url), path=url.pathname;
  if (path.startsWith('/bookmarks/api')) return api(req,env,url);
  if (path==='/bookmarks/feed.xml' && req.method==='GET') {
   try {
    const tag=url.searchParams.get('tag')||'';
    const [first,tags]=await Promise.all([
     list(env.DB,{tag,filter:'published'}),tagsList(env.DB)
    ]);
    const selected=tags.find(t=>t.id===tag);
    const tagLabel=selected?.name_zh||selected?.name||tag;
    const items=[...first.items];
    for(let n=2;n<=Math.min(first.pages,5);n++){
     const page=await list(env.DB,{tag,filter:'published',page:n});
     items.push(...page.items);
    }
    return reply(rss(items,env.SITE_URL||'https://christorng.idv.tw',tag,tagLabel),'application/rss+xml; charset=utf-8');
   }catch{return reply('RSS 暫時無法取得','text/plain; charset=utf-8',500);}
  }
  return reply('Not Found','text/plain; charset=utf-8',404);
 }
};
export default worker;
