const $ = id => document.getElementById(id);
const local = ['localhost','127.0.0.1'].includes(location.hostname);
const tokenKey = 'blog-bookmarks-admin-token';
const state = {filter:'unread', sort:'new', page:1, tag:'', q:'', items:[], tags:[], pending:new Map(), writes:new Map()};
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
 try {
  status('載入中…');
  const [data,tags]=await Promise.all([request('/?'+options()),request('/tags')]);
  const ids=new Set(data.items.map(b=>b.id));
  const pinned=state.filter==='unread'?[...state.pending.values()].filter(b=>!ids.has(b.id)):[];
  state.items=[...pinned,...data.items];
  state.tags=tags;
  $('items').innerHTML=state.items.map(itemHtml).join('')||'<p class="empty">此篩選目前沒有書籤。</p>';
  $('pager').innerHTML='<button id="prev" '+(data.page<=1?'disabled':'')+'>上一頁</button><span>第 '+data.page+' / '+data.pages+' 頁 · '+data.total+' 筆'+(pinned.length?' · '+pinned.length+' 筆待完成':'')+'</span><button id="next" '+(data.page>=data.pages?'disabled':'')+'>下一頁</button>';
  $('prev').onclick=()=>{state.pending.clear();state.page--;refresh();};
  $('next').onclick=()=>{state.pending.clear();state.page++;refresh();};
  $('tag').innerHTML='<option value="">全部標籤</option>'+tags.map(t=>'<option value="'+esc(t.id)+'"'+(state.tag===t.id?' selected':'')+'>'+esc(t.name)+' ('+t.count+')</option>').join('');
  status('');
 }catch(e){status(e.message,true);}
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
 <button type="submit">篩選</button>
 <input id="q" placeholder="搜尋標題、網址、摘要" aria-label="搜尋書籤">
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
 e.preventDefault();state.pending.clear();state.filter=$('filter').value;state.sort=$('sort').value;state.tag=$('tag').value;state.q=$('q').value;state.page=1;refresh();
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
refresh();
