const $ = id => document.getElementById(id);
const local = ['localhost','127.0.0.1'].includes(location.hostname);
const tokenKey = 'blog-bookmarks-admin-token';
const allowedFilters = ['pending','unread','readPending','private','decided','read','all','published','starred'];
const allowedSorts = ['new','old','recommended','title'];
const stateKeys = ['filter','sort','tag','q','page'];
function readLocationState(){
 const query = new URLSearchParams(location.search);
 const rawPage = query.get('page') || '1';
 return {
  filter: allowedFilters.includes(query.get('filter')) ? query.get('filter') : 'pending',
  sort: allowedSorts.includes(query.get('sort')) ? query.get('sort') : 'new',
  tag: (query.get('tag') || '').slice(0,80),
  q: (query.get('q') || '').slice(0,100),
  page: /^\d+$/.test(rawPage) ? Math.min(100000, Math.max(1,Number(rawPage))) : 1
 };
}
const state = {...readLocationState(), items:[], tags:[], pending:new Map(), writes:new Map()};
let refreshGeneration = 0;
function syncControls(){
 $('filter').value=state.filter;
 $('sort').value=state.sort;
 $('q').value=state.q;
 $('tag').value=state.tag;
}
function updateLocation(replace=false){
 const url=new URL(location.href);
 for(const key of stateKeys)url.searchParams.delete(key);
 if(state.filter!=='pending')url.searchParams.set('filter',state.filter);
 if(state.sort!=='new')url.searchParams.set('sort',state.sort);
 if(state.tag)url.searchParams.set('tag',state.tag);
 if(state.q)url.searchParams.set('q',state.q);
 if(state.page!==1)url.searchParams.set('page',String(state.page));
 history[replace?'replaceState':'pushState'](history.state,'',url.href);
}
function navigate(next,{scrollTop=false,replace=false}={}){
 Object.assign(state,next);
 state.pending.clear();
 syncControls();
 updateLocation(replace);
 void refresh();
 if(scrollTop)window.scrollTo({top:0,behavior:'auto'});
}
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = value => value ? new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)) : '';
function headers(){const h={};if(local&&sessionStorage.getItem(tokenKey))h.Authorization='Bearer '+sessionStorage.getItem(tokenKey);return h;}
async function request(path, method='GET', body) {
 const r=await fetch('/bookmarks/api/admin'+path,{method,headers:{...headers(),...(body!==undefined?{'Content-Type':'application/json'}:{})},credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const x=await r.json().catch(()=>({error:'伺服器回應格式錯誤'}));
 if(!r.ok)throw Error(x.error||'HTTP '+r.status);
 return x;
}
function status(msg,error=false){$('message').textContent=msg;$('message').classList.toggle('error',error);}
function options(){const q=new URLSearchParams();for(const k of ['filter','sort','tag','q','page'])q.set(k,state[k]);return q.toString();}
const levelName=['未讀','已讀 · 待決定','已讀 · 確定不公開','已公開','★ 已推薦'];
function itemHtml(b) {
 const label=levelName[b.status]||'';
 const target=b.preferred_url||b.redirect_url||b.url;
 const source=target!==b.url?'<div class="source-reference">原始網址：<a href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer">'+esc(b.url)+'</a></div>':'';
 const originalTitle=b.title_original&&b.title_original!==b.title?'<div class="original-title" lang="en">'+esc(b.title_original)+'</div>':'';
 const statusDate=b.status>=3?' · '+(b.status===4?'推薦':'公開')+' '+dateText(b.status_at||b.starred_at||b.published_at):'';
 const info='<div class="meta">加入 '+esc(dateText(b.created_at))+' · '+esc(new URL(b.url).hostname)+esc(statusDate)+'</div>';
 const tagNames=new Set(b.tags.map(x=>x.toLowerCase()));
 const choices=state.tags.map(t=>'<button type="button" data-tag-name="'+esc(t.name)+'" aria-pressed="'+String(tagNames.has(t.name.toLowerCase()))+'">'+esc(t.name_zh||t.name)+'</button>').join('');
 const picker='<details class="category-picker"><summary>分類：'+(b.tags.length?b.tags.map(t=>esc(state.tags.find(x=>x.name.toLowerCase()===t.toLowerCase())?.name_zh||t)).join('、'):'未分類')+' · 點擊選擇</summary><div class="category-choices">'+choices+'</div><form class="add-category" data-add-tag><input name="newtag" maxlength="80" placeholder="新增分類名稱" aria-label="新增分類"><button type="submit">新增並選取</button></form></details>';
 const note=b.status>=3?'<a class="write-note" href="/notes/editor/?bookmark='+encodeURIComponent(b.id)+'" target="_blank" rel="noopener">寫隨筆 ↗</a>':'';
 const blocked=!b.tags.length||b.savingTags;
 const disabled=blocked?' disabled title="請先選擇至少一個分類並完成儲存"':'';
 const actions='<div class="actions"><button type="button" data-decision="2">不公開</button><button type="button" data-decision="3"'+disabled+'>公開</button><button type="button" data-decision="4"'+disabled+'>推薦</button><button type="button" data-edit>編輯</button>'+note+'</div>';
 return '<article class="item" data-id="'+esc(b.id)+'"><div class="item-header"><div class="item-heading"><a class="title" href="'+esc(target)+'" target="_blank" rel="noopener noreferrer" data-read="'+esc(b.id)+'">'+esc(b.title)+' ↗</a>'+originalTitle+info+source+'</div><span class="status-name">'+label+'</span></div>'+(b.summary?'<p class="summary">'+esc(b.summary)+'</p>':'')+picker+actions+'</article>';
}
function renderItem(b){
 const article=[...document.querySelectorAll('#items [data-id]')].find(el=>el.dataset.id===b.id);
 if(!article)return;
 const open=Boolean(article.querySelector('.category-picker')?.open);
 article.outerHTML=itemHtml(b);
 if(open)[...document.querySelectorAll('#items [data-id]')].find(el=>el.dataset.id===b.id)?.querySelector('.category-picker')?.setAttribute('open','');
}
async function persistStatus(b,target){
 const previous=b.status;
 b.status=target;
 renderItem(b);
 const prior=state.writes.get(b.id)||Promise.resolve();
 const chain=prior.catch(()=>{}).then(()=>request('/'+b.id,'PATCH',{status:target}));
 state.writes.set(b.id,chain);
 try {
  const item=await chain;
  if(b.status===target)Object.assign(b,item);
  status('已儲存「'+levelName[target]+'」');
  return item;
 }catch(e){
  if(b.status===target)b.status=previous;
  renderItem(b);
  status(e.message,true);
  throw e;
 }
}
async function refresh() {
 const generation=++refreshGeneration;
 try {
  status('載入中…');
  const [data,tags]=await Promise.all([request('/?'+options()),request('/tags')]);
  if(generation!==refreshGeneration)return;
  if(state.page>data.pages){
   navigate({page:data.pages},{replace:true});
   return;
  }
  state.items=data.items;
  state.tags=tags;
  $('items').innerHTML=state.items.map(itemHtml).join('')||'<p class="empty">此篩選目前沒有書籤。</p>';
  $('pager').innerHTML='<button id="prev" '+(data.page<=1?'disabled':'')+'>上一頁</button><span>第 '+data.page+' / '+data.pages+' 頁 · '+data.total+' 筆'+'</span><button id="next" '+(data.page>=data.pages?'disabled':'')+'>下一頁</button>';
  $('prev').onclick=()=>navigate({page:state.page-1},{scrollTop:true});
  $('next').onclick=()=>navigate({page:state.page+1},{scrollTop:true});
  $('tag').innerHTML='<option value="">全部標籤</option>'+tags.map(t=>'<option value="'+esc(t.id)+'"'+(state.tag===t.id?' selected':'')+'>'+esc(t.name_zh||t.name)+' ('+t.count+')</option>').join('');
  syncControls();
  status('');
 }catch(e){if(generation===refreshGeneration)status(e.message,true);}
}
function edit(b) {
 $('editId').value=b?.id||'';
 $('editTitle').value=b?.title_zh||b?.title||'';
 $('editOriginalTitle').value=b?.title_original||'';
 $('editRedirectUrl').value=b?.redirect_url||'';
 $('editUrl').value=b?.url||'';
 $('editSummary').value=b?.summary||'';
 $('editHeading').textContent=b?'編輯書籤':'新增書籤';
 $('deleteItem').disabled=!b;
 $('editDialog').showModal();
}
$('app').innerHTML=`
<header><h1>書籤管理 <small>Bookmarks</small></h1><nav><a href="/bookmarks/admin/quick/">快速處理</a> · <a href="/bookmarks/" target="_blank" rel="noopener">公開列表 ↗</a></nav></header>
<div class="auth" id="auth"></div>
<form class="filters" id="filters">
 <select id="filter" aria-label="狀態"><option value="pending">待決定（未讀＋已讀待決定）</option><option value="unread">未讀</option><option value="readPending">已讀待決定</option><option value="private">確定不公開</option><option value="decided">已決定（不公開＋公開＋推薦）</option><option value="published">公開及推薦</option><option value="starred">推薦</option><option value="read">全部已讀</option><option value="all">全部</option></select>
 <select id="tag" aria-label="標籤"><option value="">全部標籤</option></select>
 <select id="sort" aria-label="排序"><option value="new">加入時間：最新</option><option value="old">加入時間：最舊</option><option value="recommended">推薦優先</option><option value="title">標題</option></select>
 <button type="button" id="manageTags">標籤中英對照</button>
 <input id="q" placeholder="搜尋標題、網址、摘要" aria-label="搜尋書籤">
 <button id="searchBtn" type="submit">搜尋</button>
 <button id="new" type="button">＋ 新增</button>
</form>
<div id="message" role="status" aria-live="polite"></div>
<div id="items"></div><nav id="pager" class="pager"></nav>
<dialog id="editDialog" aria-labelledby="editHeading"><form id="editForm">
 <h2 id="editHeading">編輯書籤</h2><input id="editId" type="hidden">
 <label>繁體中文標題<input id="editTitle" required maxlength="500" autocomplete="off"></label>
 <label>原文標題（例如英文）<input id="editOriginalTitle" maxlength="500" autocomplete="off"></label>
 <label>原始網址<input id="editUrl" type="url" required autocomplete="url"></label>
 <label>重導向網址（選填，優先開啟）<input id="editRedirectUrl" type="url" autocomplete="off"></label>
 <label>網站摘要（選填）<textarea id="editSummary" maxlength="5000"></textarea></label>
 <div class="dialog-actions"><button type="submit">儲存書籤</button><button type="button" id="cancelEdit">取消</button><button type="button" id="deleteItem">刪除</button></div>
</form></dialog>
<dialog id="tagsDialog" aria-labelledby="tagsHeading"><form id="tagsForm">
 <h2 id="tagsHeading">書籤標籤中英對照</h2>
 <p class="tag-hint">後台與公開頁面優先顯示中文分類名稱。標籤 ID 與既有書籤關聯不會因改名而改變。</p>
 <div class="tag-columns"><b>English</b><b>繁體中文</b><b>筆數</b></div>
 <div id="tagRows"></div>
 <div class="dialog-actions"><button type="submit">儲存對照</button><button type="button" id="closeTags">關閉</button></div>
 </form></dialog>`;
if(local){
 $('auth').innerHTML='<input id="token" type="password" autocomplete="off" placeholder="本機管理 Token"><button id="login">登入</button><span class="hint">Token 僅儲存在此分頁</span>';
 $('token').value=sessionStorage.getItem(tokenKey)||'';
 $('login').onclick=()=>{sessionStorage.setItem(tokenKey,$('token').value);refresh();};
}
const tokenTools=document.createElement('section');
tokenTools.className='token-tools';
tokenTools.innerHTML='<button id="generateToken" type="button">產生 Tampermonkey Token</button><span class="hint">重新產生會使舊 Token 失效。</span><div id="tokenResult" hidden><input id="tokenValue" readonly aria-label="一次性新增 Token"><button id="copyToken" type="button">複製</button></div>';
$('auth').after(tokenTools);
$('generateToken').onclick=async()=>{
 if(!confirm('產生新 Token 後，舊 Token 將失效。確定繼續？'))return;
 try{const data=await request('/ingest-token','POST',{});$('tokenValue').value=data.token;$('tokenResult').hidden=false;status('Token 僅顯示這一次，請複製至 Tampermonkey。');}
 catch(e){status(e.message,true);}
};
$('copyToken').onclick=async()=>{
 try{await navigator.clipboard.writeText($('tokenValue').value);status('Token 已複製');}
 catch{$('tokenValue').select();status('請複製已選取的 Token');}
};
$('filters').onsubmit=e=>{
 e.preventDefault();
 navigate({q:$('q').value.trim(),page:1},{scrollTop:true});
};
for(const id of ['filter','tag','sort']){
 $(id).addEventListener('change',()=>{
  navigate({filter:$('filter').value,tag:$('tag').value,sort:$('sort').value,page:1},{scrollTop:true});
 });
}
function openTags(){
 $('tagRows').innerHTML=state.tags.map(t=>
  '<div class="tag-row" data-tag-id="'+esc(t.id)+'">' +
  '<input class="tag-en" maxlength="80" aria-label="英文標籤 '+esc(t.name)+'" value="'+esc(t.name)+'">' +
  '<input class="tag-zh" maxlength="80" aria-label="中文標籤 '+esc(t.name)+'" value="'+esc(t.name_zh||'')+'" placeholder="公開中文名稱">' +
  '<span class="tag-count">'+Number(t.count||0)+'</span></div>'
 ).join('');
 $('tagsDialog').showModal();
}
$('manageTags').onclick=openTags;
$('closeTags').onclick=()=>$('tagsDialog').close();
$('tagsForm').onsubmit=async e=>{
 e.preventDefault();
 const save=$('tagsForm').querySelector('button[type="submit"]');
 save.disabled=true;
 let count=0;
 try{
  for(const row of $('tagRows').querySelectorAll('[data-tag-id]')){
   const id=row.dataset.tagId;
   const current=state.tags.find(x=>x.id===id);
   const name=row.querySelector('.tag-en').value.trim();
   const name_zh=row.querySelector('.tag-zh').value.trim();
   if(!current||!name)throw Error('英文標籤不得為空');
   if(current.name===name && (current.name_zh||'')===name_zh)continue;
   await request('/tags/'+encodeURIComponent(id),'PATCH',{name,name_zh});
   count++;
  }
  $('tagsDialog').close();
  await refresh();
  status(count?'已儲存 '+count+' 個標籤的中英對照':'標籤未變更');
 }catch(error){status('標籤儲存失敗：'+error.message,true);}
 finally{save.disabled=false;}
};
$('new').onclick=()=>edit(null);
$('cancelEdit').onclick=()=>$('editDialog').close();
$('items').addEventListener('click',async e=>{
 const itemElement=e.target.closest('[data-id]');if(!itemElement)return;
 const b=state.items.find(x=>x.id===itemElement.dataset.id);if(!b)return;
 if(e.target.closest('[data-read]')){
  if(b.status===0)persistStatus(b,1).then(()=>{if(state.filter==='unread')void refresh();}).catch(()=>{});
  return;
 }
 if(e.target.closest('[data-edit]')){edit(b);return;}
 const tag=e.target.closest('[data-tag-name]');
 if(tag){
  const name=tag.dataset.tagName,old=[...b.tags];
  b.tags=old.some(t=>t.toLowerCase()===name.toLowerCase())?
   old.filter(t=>t.toLowerCase()!==name.toLowerCase()):[...old,name];
  b.savingTags=true;
  renderItem(b);
  try{
   const updated=await request('/'+b.id,'PATCH',{tags:b.tags});
   Object.assign(b,updated);
   state.tags=await request('/tags');
  }catch(error){b.tags=old;status(error.message,true);}
  finally{b.savingTags=false;renderItem(b);}
  return;
 }
 const decision=e.target.closest('[data-decision]');
 if(decision){
  const level=Number(decision.dataset.decision);
  if(level>=3&&(!b.tags.length||b.savingTags)){
   status('公開或推薦前，請先選擇並儲存至少一個分類',true);return;
  }
  const queue=['pending','unread','readPending'].includes(state.filter);
  const previous=b.status;
  if(queue){
   itemElement.remove();
   state.items=state.items.filter(x=>x.id!==b.id);
   if(!state.items.length)$('items').innerHTML='<p class="empty">正在載入下一筆…</p>';
  }
  try{
   await request('/'+b.id,'PATCH',{status:level});
   await refresh();
   status('已決定：'+levelName[level]);
  }catch(error){
   b.status=previous;
   await refresh();
   status(error.message,true);
  }
 }
});
$('items').addEventListener('submit',async e=>{
 const form=e.target.closest('[data-add-tag]');if(!form)return;
 e.preventDefault();
 const element=form.closest('[data-id]');
 const b=state.items.find(x=>x.id===element?.dataset.id);
 const name=form.elements.newtag.value.trim();
 if(!b||!name||name.length>80)return;
 const old=[...b.tags];
 if(!b.tags.some(x=>x.toLowerCase()===name.toLowerCase()))b.tags.push(name);
 b.savingTags=true;renderItem(b);
 try{
  const updated=await request('/'+b.id,'PATCH',{tags:b.tags});
  Object.assign(b,updated);
  state.tags=await request('/tags');
  renderItem(b);
  status('已加入分類：'+name);
 }catch(error){b.tags=old;status(error.message,true);}
 finally{b.savingTags=false;renderItem(b);}
});

$('editForm').onsubmit=async e=>{
 e.preventDefault();
 const id=$('editId').value;
 const body={title:$('editTitle').value,title_zh:$('editTitle').value,title_original:$('editOriginalTitle').value,url:$('editUrl').value,redirect_url:$('editRedirectUrl').value,summary:$('editSummary').value};
 try{await request(id?'/'+id:'',id?'PATCH':'POST',body);$('editDialog').close();await refresh();status('已儲存');}
 catch(err){status(err.message,true);}
};
$('deleteItem').onclick=async()=>{
 const id=$('editId').value;if(!id||!confirm('確定刪除這個書籤？'))return;
 try{await request('/'+id,'DELETE');state.pending.delete(id);$('editDialog').close();await refresh();status('已刪除');}
 catch(err){status(err.message,true);}
};
syncControls();
window.addEventListener('popstate',()=>{
 Object.assign(state,readLocationState());
 state.pending.clear();
 syncControls();
 void refresh();
 window.scrollTo({top:0,behavior:'auto'});
});
void refresh();
