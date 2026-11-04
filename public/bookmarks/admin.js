const $ = id => document.getElementById(id);
const local = ['localhost','127.0.0.1'].includes(location.hostname);
const tokenKey = 'blog-bookmarks-admin-token';
const allowedFilters = ['unread','read','all','published','starred'];
const allowedSorts = ['new','old','recommended','title'];
const stateKeys = ['filter','sort','tag','q','page'];
function readLocationState(){
 const query = new URLSearchParams(location.search);
 const rawPage = query.get('page') || '1';
 return {
  filter: allowedFilters.includes(query.get('filter')) ? query.get('filter') : 'unread',
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
 if(state.filter!=='unread')url.searchParams.set('filter',state.filter);
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
const levelName=['未讀','已讀 · 待決策','已公開','★ 已推薦'];
function itemHtml(b) {
 const pending=state.pending.has(b.id), label=levelName[b.status]||'';
 const statusDate=b.status>=2?' · '+(b.status===3?'推薦':'公開')+' '+dateText(b.status_at||b.starred_at||b.published_at):'';
 const info='<div class="meta">加入 '+esc(dateText(b.created_at))+' · '+esc(new URL(b.url).hostname)+esc(statusDate)+'</div>';
 const checks=[1,2,3].map((level,i)=>'<label><input type="checkbox" data-level="'+level+'" '+(b.status>=level?'checked ':'')+'> '+['已讀','公開','推薦'][i]+'</label>').join('');
 const actions='<div class="actions">'+checks+'<button type="button" data-edit>編輯</button>'+(b.status>=2?'<a class="write-note" href="/notes/editor/?bookmark='+encodeURIComponent(b.id)+'" target="_blank" rel="noopener">寫隨筆 ↗</a>':'')+'</div>';
 const decision=pending?'<div class="decision-row"><button type="button" data-keep class="private">保留私人・完成</button><button type="button" data-finish class="finish">完成，下一筆</button><p>狀態變更即時儲存；按完成才移出目前工作清單。</p></div>':'';
 return '<article class="item'+(pending?' pending':'')+'" data-id="'+esc(b.id)+'"><div class="item-header"><div class="item-heading"><a class="title" href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer" data-read="'+esc(b.id)+'">'+esc(b.title)+' ↗</a>'+info+'</div><span class="status-name">'+label+'</span></div>'+(b.summary?'<p class="summary">'+esc(b.summary)+'</p>':'')+(b.tags.length?'<div class="tagline">'+b.tags.map(t=>'#'+esc(t)).join(' · ')+'</div>':'')+actions+decision+'</article>';
}
function renderItem(b){
 const article=[...document.querySelectorAll('#items [data-id]')].find(el=>el.dataset.id===b.id);
 if(article)article.outerHTML=itemHtml(b);
}
async function persistStatus(b,target){
 const previous=b.status;
 b.status=target;
 if(state.filter==='unread')state.pending.set(b.id,b);
 renderItem(b);
 const prior=state.writes.get(b.id)||Promise.resolve();
 const chain=prior.catch(()=>{}).then(()=>request('/'+b.id,'PATCH',{status:target}));
 state.writes.set(b.id,chain);
 try {
  const item=await chain;
  if(b.status===target){
   Object.assign(b,item);
   status('已儲存「'+levelName[target]+'」');
  }
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
  const ids=new Set(data.items.map(b=>b.id));
  const pinned=state.filter==='unread'?[...state.pending.values()].filter(b=>!ids.has(b.id)):[];
  state.items=[...pinned,...data.items];
  state.tags=tags;
  $('items').innerHTML=state.items.map(itemHtml).join('')||'<p class="empty">此篩選目前沒有書籤。</p>';
  $('pager').innerHTML='<button id="prev" '+(data.page<=1?'disabled':'')+'>上一頁</button><span>第 '+data.page+' / '+data.pages+' 頁 · '+data.total+' 筆'+(pinned.length?' · '+pinned.length+' 筆待完成':'')+'</span><button id="next" '+(data.page>=data.pages?'disabled':'')+'>下一頁</button>';
  $('prev').onclick=()=>navigate({page:state.page-1},{scrollTop:true});
  $('next').onclick=()=>navigate({page:state.page+1},{scrollTop:true});
  $('tag').innerHTML='<option value="">全部標籤</option>'+tags.map(t=>'<option value="'+esc(t.id)+'"'+(state.tag===t.id?' selected':'')+'>'+esc(t.name)+' ('+t.count+')</option>').join('');
  syncControls();
  status('');
 }catch(e){if(generation===refreshGeneration)status(e.message,true);}
}
function edit(b) {
 $('editId').value=b?.id||'';
 $('editTitle').value=b?.title||'';
 $('editUrl').value=b?.url||'';
 $('editSummary').value=b?.summary||'';
 $('editTags').value=b?.tags?.join(', ')||'';
 $('editHeading').textContent=b?'編輯書籤':'新增書籤';
 $('deleteItem').disabled=!b;
 $('editDialog').showModal();
}
$('app').innerHTML=`
<header><h1>書籤管理 <small>Bookmarks</small></h1><a href="/bookmarks/" target="_blank" rel="noopener">公開列表 ↗</a></header>
<div class="auth" id="auth"></div>
<form class="filters" id="filters">
 <select id="filter" aria-label="狀態"><option value="unread">未讀</option><option value="read">已讀</option><option value="all">全部</option><option value="published">公開</option><option value="starred">推薦</option></select>
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
 <label>標題<input id="editTitle" required maxlength="500" autocomplete="off"></label>
 <label>原始網址<input id="editUrl" type="url" required autocomplete="url"></label>
 <label>網站摘要（選填）<textarea id="editSummary" maxlength="5000"></textarea></label>
 <label>書籤標籤（逗號分隔）<input id="editTags" placeholder="AI, 音樂, 科學"></label>
 <div class="dialog-actions"><button type="submit">儲存書籤</button><button type="button" id="cancelEdit">取消</button><button type="button" id="deleteItem">刪除</button></div>
</form></dialog>
<dialog id="tagsDialog" aria-labelledby="tagsHeading"><form id="tagsForm">
 <h2 id="tagsHeading">書籤標籤中英對照</h2>
 <p class="tag-hint">後台及 Tampermonkey 使用英文，公開書籤與 RSS 使用中文。標籤網址及既有書籤關聯不會因改名而改變。</p>
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
   if(b.status===0)persistStatus(b,1).catch(()=>{});
   return;
 }
 if(e.target.closest('[data-edit]')){edit(b);return;}
 if(e.target.closest('[data-keep]')){
   try{if(b.status!==1)await persistStatus(b,1);await state.writes.get(b.id);state.pending.delete(b.id);await refresh();}
   catch(e){status(e.message,true);}
   return;
 }
 if(e.target.closest('[data-finish]')){
   if(b.status===0){status('請先閱讀或勾選已讀。',true);return;}
   try{await state.writes.get(b.id);state.pending.delete(b.id);await refresh();}
   catch(e){status(e.message,true);}
 }
});
$('items').addEventListener('change',e=>{
 const input=e.target.closest('[data-level]');if(!input)return;
 const b=state.items.find(x=>x.id===input.closest('[data-id]').dataset.id);if(!b)return;
 const level=Number(input.dataset.level);
 const target=input.checked?Math.max(b.status,level):Math.min(b.status,level-1);
 persistStatus(b,target).catch(()=>{});
});
$('editForm').onsubmit=async e=>{
 e.preventDefault();
 const id=$('editId').value;
 const body={title:$('editTitle').value,url:$('editUrl').value,summary:$('editSummary').value,tags:$('editTags').value.split(',').map(x=>x.trim()).filter(Boolean)};
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
