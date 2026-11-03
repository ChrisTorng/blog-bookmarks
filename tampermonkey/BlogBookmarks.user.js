// ==UserScript==
// @name         Blog Bookmarks - BetaCat
// @namespace    https://christorng.idv.tw/
// @version      0.1.0
// @description  Collect BetaCat links into private Bookmarks
// @match        https://hackernews.betacat.io/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      christorng.idv.tw
// @run-at       document-idle
// ==/UserScript==

(() => {
 'use strict';
 const endpoint='https://christorng.idv.tw/bookmarks/api/ingest';
 const tokenKey='blog-bookmarks-ingest-token';
 const categoryKey='blog-bookmarks-last-category';
 let token=GM_getValue(tokenKey,''), categories=[];
 const cached=new WeakSet();
 const entries=new Map();
 const checked=new Set();
 let preloadTimer;
 function request(path,method='GET',body) {
  return new Promise((resolve,reject)=>{
   if(!token) return reject(Error('尚未設定新增 Token'));
   GM_xmlhttpRequest({
    method,url:endpoint+path,timeout:15000,
    headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
    data:body?JSON.stringify(body):undefined,
    onload:r=>{try{const val=JSON.parse(r.responseText);r.status>=200&&r.status<300?resolve(val):reject(Error(val.error||'HTTP '+r.status));}catch(e){reject(e);}},
    onerror:()=>reject(Error('網路連線失敗')),
    ontimeout:()=>reject(Error('連線逾時'))
   });
  });
 }
 function setToken(){
  const value=prompt('請輸入 blog-bookmarks 的新增 Token（僅儲存在 Tampermonkey 本機設定）',token);
  if(value===null)return;
  token=value.trim();GM_setValue(tokenKey,token);
  checked.clear();updateCategories();schedulePreload();
 }
 async function updateCategories(){
  if(!token)return;
  try{categories=(await request('/tags')).map(x=>x.name);}catch(e){console.warn('Bookmarks tags:',e.message);}
 }
 function story(link){
  let url;try{url=new URL(link.href);}catch{return null;}
  if(!['https:','http:'].includes(url.protocol)||
    ['hackernews.betacat.io','news.ycombinator.com'].includes(url.hostname))return null;
  const title=(link.textContent||'').trim().replace(/\s+/g,' ');
  if(title.length<10||title.length>500)return null;
  const card=link.closest('article,li,.story,.item,.post')||link.parentElement?.parentElement;
  const summary=card?.querySelector('.summary,.description,[data-summary],blockquote,p')?.textContent?.trim()||'';
  return {url:url.href,title,summary:summary===title?'':summary.slice(0,5000)};
 }
 function button(el,label){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.className='blog-bookmark-control';
  b.style.cssText='margin-left:7px;cursor:pointer;font:inherit;font-size:.88em;border:1px solid #8888;border-radius:5px;background:transparent;padding:1px 5px';
  el.after(b);return b;
 }
 function mark(b,tags=[]){
  b.dataset.tags=JSON.stringify(tags);
  b.textContent=tags.length?tags.slice(0,2).join(', '):'✓';b.title='已收藏到 Bookmarks';
  b.style.opacity='.7';
  b.dataset.saved='1';
 }
 function save(data,b,category){
  const tags=category?[category]:[];
  const saved=b.dataset.saved==='1';
  return request(saved?'/update-tags':'', 'POST', saved?{url:data.url,tags}:{...data,tags}).then(x=>{
   mark(b,tags);return x;
  }).catch(e=>{b.textContent='!';b.title=e.message;});
 }
 function selector(b,data){
  document.querySelectorAll('.blog-bookmark-panel').forEach(x=>x.remove());
  const box=document.createElement('span');box.className='blog-bookmark-panel';
  box.style.cssText='display:inline-flex;gap:5px;align-items:center;margin-left:6px;padding:6px;border:1px solid #8888;border-radius:5px;background:Canvas;color:CanvasText;z-index:9999';
  const select=document.createElement('select');
  const existingTags=JSON.parse(b.dataset.tags||'[]');
  const current=existingTags[0]||GM_getValue(categoryKey,'default');
  for(const v of [...new Set(['default',current,...categories])]){
   const opt=new Option(v,v);select.add(opt);
  }
  select.value=current;
  const input=document.createElement('input');input.placeholder='新標籤';input.size=9;
  const saveButton=document.createElement('button');saveButton.textContent='加入';
  const cancel=document.createElement('button');cancel.textContent='×';
  box.append(select,input,saveButton,cancel);b.after(box);
  cancel.onclick=()=>box.remove();
  saveButton.onclick=()=>{
   const category=input.value.trim()||select.value;
   GM_setValue(categoryKey,category);
   save(data,b,category).then(()=>box.remove());
  };
 }
 function schedulePreload(){
  if(!token)return;
  clearTimeout(preloadTimer);
  preloadTimer=setTimeout(preload,250);
 }
 async function preload(){
  const pending=[...entries.keys()].filter(url=>!checked.has(url));
  for(let i=0;i<pending.length;i+=75){
   const urls=pending.slice(i,i+75);
   try{
    const existing=await request('/status','POST',{urls});
    for(const url of urls)checked.add(url);
    for(const record of existing){
     const links=entries.get(record.url)||[];
     for(const {button:b} of links){
      mark(b,record.tags||[]);
      b.title='已收藏 · '+(record.tags||[]).join(', ');
     }
    }
   }catch(error){console.warn('Bookmarks status prefetch:',error.message);return;}
  }
 }
 function install(){
  let additions=0;
  for(const a of document.querySelectorAll('main a[href],article a[href]')){
   if(cached.has(a))continue;
   const data=story(a);if(!data)continue;
   cached.add(a);
   const b=button(a,'☆');b.title='收藏（預設未讀與私人）';
   const url=new URL(data.url);url.hash='';
   if(!entries.has(url.href))entries.set(url.href,[]);
   entries.get(url.href).push({button:b,data});
   additions++;
   b.onclick=e=>{e.preventDefault();e.stopPropagation();selector(b,data);};
  }
  if(additions)schedulePreload();
 }
 const config=document.createElement('button');
 config.textContent='Bookmarks 設定';
 config.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483647;padding:5px;border:1px solid #8888;border-radius:6px;background:Canvas;color:CanvasText;font:12px system-ui';
 config.onclick=setToken;document.body.append(config);
 updateCategories();install();
 const observer=new MutationObserver(()=>install());
 observer.observe(document.body,{childList:true,subtree:true});
})();
