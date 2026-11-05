const $ = id => document.getElementById(id);
const local = ['localhost','127.0.0.1'].includes(location.hostname);
const tokenKey = 'blog-bookmarks-admin-token';
const choices = [6,10,20];
const initialSize = Number(new URLSearchParams(location.search).get('size'));
const state = {
 size:choices.includes(initialSize)?initialSize:6,
 recent:[], pending:[], tags:[], remaining:0,
 loading:false, inflight:0, generation:0, changeVersion:0,
 writes:new Map(), busy:new Set()
};
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText = value => value ? new Intl.DateTimeFormat('zh-TW',{
 timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).format(new Date(value)) : '';
const levels = ['未讀','已讀','不公開','公開','推薦'];
const half = () => state.size/2;
function message(text='',error=false){
 $('message').textContent=text;
 $('message').classList.toggle('error',error);
}
function headers(){
 const token=local&&sessionStorage.getItem(tokenKey);
 return token?{Authorization:'Bearer '+token}:{};
}
async function request(path,method='GET',body){
 const response=await fetch('/bookmarks/api/admin'+path,{
  method,credentials:'same-origin',cache:'no-store',
  headers:{...headers(),...(body===undefined?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>({error:'伺服器回應格式錯誤'}));
 if(!response.ok)throw Error(data.error||'HTTP '+response.status);
 return data;
}
function queueWrite(id,action){
 const earlier=state.writes.get(id)||Promise.resolve();
 const task=earlier.catch(()=>{}).then(action);
 state.writes.set(id,task);
 task.then(()=>{if(state.writes.get(id)===task)state.writes.delete(id)},
   ()=>{if(state.writes.get(id)===task)state.writes.delete(id)});
 return task;
}
function card(b,kind){
 const target=b.preferred_url||b.redirect_url||b.url;
 const original=b.title_original&&b.title_original!==(b.title_zh||b.title)
  ?'<div class="quick-original" lang="en">'+esc(b.title_original)+'</div>':'';
 const tags=new Set(b.tags.map(t=>t.toLowerCase()));
 const categoryButtons=state.tags.map(t=>{
  const selected=tags.has(t.name.toLowerCase());
  return '<button type="button" class="category" data-tag-name="'+esc(t.name)+'" aria-pressed="'+selected+'">'+esc(t.name_zh||t.name)+'</button>';
 }).join('');
 const actions=[3,4,2].map(level=>{
  const disabled=(level>=3&&!b.tags.length)||state.busy.has(b.id);
  const selected=b.status===level;
  return '<button type="button" data-decision="'+level+'" aria-pressed="'+selected+'"'+(disabled?' disabled':'')+'>'+levels[level]+'</button>';
 }).join('');
 return '<article class="quick-item '+kind+'" data-id="'+esc(b.id)+'" data-kind="'+kind+'" tabindex="-1">'+
  '<div class="quick-main"><div class="quick-content"><a class="quick-title" href="'+esc(target)+'" target="_blank" rel="noopener noreferrer" data-read>'+esc(b.title_zh||b.title)+' ↗</a>'+
  original+'<div class="quick-date">'+esc(dateText(b.created_at))+'</div>'+
  (b.summary?'<p class="quick-summary">'+esc(b.summary)+'</p>':'')+
  '</div><div class="quick-actions">'+actions+
  '<button type="button" data-edit>編輯</button>'+
  '<button type="button" class="quick-delete" data-delete>刪除</button></div></div>'+
  '<aside class="quick-categories" aria-label="分類">'+categoryButtons+'</aside></article>';
}

function findCard(id){
 return [...$('items').querySelectorAll('.quick-item')].find(x=>x.dataset.id===id);
}
function firstPending(){
 return $('items').querySelector('.quick-item[data-kind="pending"]');
}
function focusNext(){
 const next=firstPending();
 if(!next)return;
 next.focus({preventScroll:true});
 ($('items').querySelector('.pending-label')||next).scrollIntoView({block:'start',behavior:'instant'});
}
function render({focus=false,preserveId=null}={}){
 const anchor=preserveId?findCard(preserveId):null;
 const top=anchor?.getBoundingClientRect().top;
 const recent=state.recent.slice(-half());
 const pending=state.pending.slice(0,half());
 const last=state.recent.at(-1);
 const lastTags=last?.tags.map(name=>{
  const t=state.tags.find(t=>t.name.toLowerCase()===name.toLowerCase());
  return esc(t?.name_zh||t?.name||name);
 }).join('、');
 const lastLabel=last?'<button type="button" class="quick-latest" data-scroll-previous title="查看上一筆已處理書籤">'+
  esc(last.status===4?'已推薦':last.status===3?'已公開':'不公開')+
  (lastTags?' · '+lastTags:'')+'</button>':'';
 $('items').innerHTML=
  (recent.length?'<div class="quick-section-label">最近已處理 · '+recent.length+' 筆</div>':'')+
  recent.map(b=>card(b,'recent')).join('')+
  '<div class="quick-section-label pending-label"><span>待處理 '+state.remaining.toLocaleString('zh-TW')+' 筆</span>'+lastLabel+'</div>'+
  (pending.length?pending.map(b=>card(b,'pending')).join(''):
   '<p class="empty">'+(state.remaining?'正在載入待處理書籤…':'目前已全部處理完成。')+'</p>');
 if(focus){focusNext();return;}
 if(top!==undefined){
  const next=findCard(preserveId);
  if(next)window.scrollBy({top:next.getBoundingClientRect().top-top,behavior:'instant'});
 }
}

function updateCard(b){
 const item=findCard(b.id);
 if(!item)return;
 const wasFocused=item===document.activeElement;
 const kind=item.dataset.kind;
 const contentScroll=item.querySelector('.quick-content')?.scrollTop||0;
 item.outerHTML=card(b,kind);
 const replacement=findCard(b.id);
 const content=replacement?.querySelector('.quick-content');
 if(content)content.scrollTop=contentScroll;
 if(wasFocused)replacement?.focus({preventScroll:true});
}
async function load(size=state.size,{focus=true}={}){
 const generation=++state.generation;
 state.loading=true;
 message('載入中…');
 try{
  const [data,tags]=await Promise.all([request('/quick?size='+size),request('/tags')]);
  if(generation!==state.generation)return;
  state.size=size;
  state.recent=data.recent;
  state.pending=data.pending;
  state.remaining=data.remaining;
  state.tags=tags;
  state.loading=false;
  $('size').value=String(size);
  render({focus});
  message('');
 }catch(error){
  if(generation===state.generation){state.loading=false;message(error.message,true);}
 }
}
// Reconcile only once all decisions have finished. Ignore responses overtaken by
// new user actions; this prevents a stale fetch from bringing back processed cards.
async function reconcile(){
 if(state.inflight||state.loading)return;
 const version=state.changeVersion;
 const generation=state.generation;
 const anchor=firstPending()?.dataset.id;
 try{
  const [data,tags]=await Promise.all([
   request('/quick?size='+state.size),request('/tags')
  ]);
  if(generation!==state.generation||version!==state.changeVersion||state.inflight)return;
  state.recent=data.recent;
  state.pending=data.pending;
  state.remaining=data.remaining;
  state.tags=tags;
  render({preserveId:anchor});
 }catch(error){message('已儲存，但同步清單失敗：'+error.message,true);}
}
function takeDecision(b,level){
 if(state.busy.has(b.id)||state.loading)return;
 if(level>=3&&!b.tags.length){message('請先選擇至少一個分類，才能公開或推薦',true);return;}
 const oldStatus=b.status;
 if(oldStatus===level)return;
 const previousRecent=[...state.recent];
 const wasPending=oldStatus<2;
 state.busy.add(b.id);
 state.inflight++;
 state.changeVersion++;
 const next={...b,status:level};
 state.pending=state.pending.filter(x=>x.id!==b.id);
 state.recent=[...state.recent.filter(x=>x.id!==b.id),next].slice(-half());
 if(wasPending)state.remaining--;
 render({focus:wasPending,preserveId:wasPending?null:b.id});
 message('已選擇「'+levels[level]+'」，正在儲存…');
 queueWrite(b.id,()=>request('/'+b.id,'PATCH',{status:level,tags:[...b.tags]}))
 .then(()=>{
  message('已儲存：'+levels[level]);
 },error=>{
  // Restore the preceding state on failure; never silently discard a decision.
  // Roll back only this record: other pending decisions may have advanced already.
  state.recent=state.recent.filter(x=>x.id!==b.id);
  if(wasPending){
   if(!state.pending.some(x=>x.id===b.id)){
    state.pending=[...state.pending,{...b,status:oldStatus}]
     .sort((a,z)=>z.created_at.localeCompare(a.created_at)||z.id.localeCompare(a.id));
    state.remaining++;
   }
  }else{
   const original=previousRecent.find(x=>x.id===b.id)||{...b,status:oldStatus};
   const position=previousRecent.findIndex(x=>x.id===b.id);
   state.recent.splice(Math.min(Math.max(0,position),state.recent.length),0,original);
   state.recent=state.recent.slice(-half());
  }
  state.changeVersion++;
  render({focus:wasPending,preserveId:wasPending?null:b.id});
  message('儲存失敗：'+error.message,true);
 }).finally(()=>{
  state.busy.delete(b.id);
  state.inflight--;
  if(!state.inflight)void reconcile();
 });
}
function changeTag(b,name){
 if(state.busy.has(b.id)||state.loading)return;
 const old=[...b.tags];
 const selected=old.some(t=>t.toLowerCase()===name.toLowerCase());
 if(selected&&b.status>=3&&old.length===1){
  message('公開或推薦的書籤必須保留至少一個分類；可先改成不公開',true);
  return;
 }
 const next=selected?old.filter(t=>t.toLowerCase()!==name.toLowerCase()):[...old,name];
 b.tags=next;
 state.changeVersion++;
 updateCard(b);
 const version=state.changeVersion;
 queueWrite(b.id,()=>request('/'+b.id,'PATCH',{tags:next}))
 .then(()=>{
  if(version===state.changeVersion)message('分類已儲存');
 },error=>{
  if(b.tags===next || b.tags.join('\0')===next.join('\0')){
   b.tags=old;updateCard(b);
  }
  message('分類儲存失敗：'+error.message,true);
 });
}
let editHistoryOpen=false;
let editClosing=false;
function closeEdit(){
 if($('editDialog').open)$('editDialog').close();
 if(editHistoryOpen&&!editClosing){
  editClosing=true;
  history.back();
 }
}
window.addEventListener('popstate',()=>{
 if(!editHistoryOpen)return;
 editHistoryOpen=false;
 editClosing=false;
 if($('editDialog').open)$('editDialog').close();
});
function edit(b){
 if(state.busy.has(b.id)||editClosing||$('editDialog').open)return;
 $('editId').value=b.id;
 $('editTitle').value=b.title_zh||b.title||'';
 $('editOriginalTitle').value=b.title_original||'';
 $('editUrl').value=b.url||'';
 $('editRedirectUrl').value=b.redirect_url||'';
 $('editSummary').value=b.summary||'';
 $('editDialog').showModal();
 // A same-URL history entry makes the Android browser Back key close editing.
 // Keep focus on a non-input element so opening the dialog never raises the IME.
 history.pushState({...((history.state&&typeof history.state==='object')?history.state:{}),quickReviewEditing:true},'',location.href);
 editHistoryOpen=true;
 $('editHeading').focus({preventScroll:true});
}
function deleteBookmark(b){
 if(state.busy.has(b.id)||state.loading)return;
 if(!confirm('確定永久刪除這筆書籤？'))return;
 const wasPending=b.status<2;
 state.busy.add(b.id);
 state.inflight++;
 state.changeVersion++;
 state.recent=state.recent.filter(item=>item.id!==b.id);
 state.pending=state.pending.filter(item=>item.id!==b.id);
 if(wasPending)state.remaining--;
 render({focus:wasPending});
 message('正在刪除…');
 queueWrite(b.id,()=>request('/'+b.id,'DELETE')).then(result=>{
  if(!result.deleted)throw Error('找不到書籤');
  message('已刪除');
 },error=>{
  if(wasPending){
   state.pending.push(b);
   state.pending.sort((a,z)=>z.created_at.localeCompare(a.created_at)||z.id.localeCompare(a.id));
   state.remaining++;
  }else state.recent=[...state.recent,b].slice(-half());
  state.changeVersion++;
  render({focus:wasPending});
  message('刪除失敗：'+error.message,true);
 }).finally(()=>{
  state.busy.delete(b.id);
  state.inflight--;
  if(!state.inflight)void reconcile();
 });
}
$('app').innerHTML=
 '<header class="quick-header"><h1>書籤快速處理</h1><nav><a href="/bookmarks/admin/">完整管理</a> · <a href="/bookmarks/" target="_blank" rel="noopener">公開列表 ↗</a></nav></header>'+
 '<div class="quick-toolbar"><select id="size" aria-label="顯示數量">'+
 '<option value="6">3＋3</option><option value="10">5＋5</option>'+
 '<option value="20">10＋10</option></select></div>'+
 '<div class="auth" id="auth"></div>'+
 '<div id="message" role="status" aria-live="polite"></div>'+
 '<main id="items" aria-label="快速處理清單"></main>'+
 '<dialog id="editDialog" aria-labelledby="editHeading"><form id="editForm">'+
 '<h2 id="editHeading" tabindex="-1" autofocus>編輯書籤</h2><input id="editId" type="hidden">'+
 '<label>繁體中文標題<input id="editTitle" required maxlength="500" autocomplete="off"></label>'+
 '<label>原文標題<input id="editOriginalTitle" maxlength="500" autocomplete="off"></label>'+
 '<label>原始網址<input id="editUrl" type="url" required></label>'+
 '<label>重導向網址<input id="editRedirectUrl" type="url"></label>'+
 '<label>摘要<textarea id="editSummary" maxlength="5000"></textarea></label>'+
 '<div class="dialog-actions"><button id="saveEdit" type="submit">儲存</button><button id="cancelEdit" type="button">取消</button></div>'+
 '</form></dialog>';
$('size').value=String(state.size);
$('cancelEdit').onclick=closeEdit;
$('editDialog').addEventListener('cancel',event=>{
 event.preventDefault();
 closeEdit();
});
$('editForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const id=$('editId').value;
 const b=[...state.recent,...state.pending].find(x=>x.id===id);
 if(!b||state.busy.has(id))return;
 const raw={
  title_zh:$('editTitle').value.trim(),
  title_original:$('editOriginalTitle').value.trim(),
  url:$('editUrl').value.trim(),
  redirect_url:$('editRedirectUrl').value.trim(),
  summary:$('editSummary').value.trim()
 };
 if(!raw.title_zh||!raw.url)return;
 state.busy.add(id);
 state.inflight++;
 state.changeVersion++;
 $('saveEdit').disabled=true;
 $('cancelEdit').disabled=true;
 try{
  const updated=await queueWrite(id,()=>request('/'+id,'PATCH',raw));
  Object.assign(b,updated);
  updateCard(b);
  closeEdit();
  message('已儲存');
 }catch(error){message('編輯失敗：'+error.message,true);}
 finally{
  state.busy.delete(id);
  state.inflight--;
  $('saveEdit').disabled=false;
  $('cancelEdit').disabled=false;
  if(!state.inflight)void reconcile();
 }
});
$('size').addEventListener('change',()=>{
 const size=Number($('size').value);
 if(!choices.includes(size))return;
 const url=new URL(location.href);
 if(size===6)url.searchParams.delete('size');else url.searchParams.set('size',String(size));
 history.replaceState(history.state,'',url.href);
 void load(size);
});
if(local){
 $('auth').innerHTML='<input id="token" type="password" autocomplete="off" placeholder="本機管理 Token"><button type="button" id="login">登入</button>';
 $('token').value=sessionStorage.getItem(tokenKey)||'';
 $('login').addEventListener('click',()=>{
  sessionStorage.setItem(tokenKey,$('token').value);
  void load();
 });
}
$('items').addEventListener('click',event=>{
 if(event.target.closest('[data-scroll-previous]')){
  const previous=[...$('items').querySelectorAll('.quick-item.recent')].at(-1);
  previous?.scrollIntoView({block:'start',behavior:'smooth'});
  return;
 }
 const element=event.target.closest('.quick-item');
 if(!element)return;
 const b=[...state.recent,...state.pending].find(x=>x.id===element.dataset.id);
 if(!b)return;
 if(event.target.closest('[data-edit]')){edit(b);return;}
 if(event.target.closest('[data-delete]')){deleteBookmark(b);return;}
 const tag=event.target.closest('[data-tag-name]');
 if(tag){changeTag(b,tag.dataset.tagName);return;}
 const decision=event.target.closest('[data-decision]');
 if(decision){takeDecision(b,Number(decision.dataset.decision));return;}
 if(event.target.closest('[data-read]')&&b.status===0){
  // Opening the source does not advance the queue; it only marks it read.
  b.status=1;
  queueWrite(b.id,()=>request('/'+b.id,'PATCH',{status:1}))
   .catch(error=>message('已開啟原文，但標記已讀失敗：'+error.message,true));
 }
});
void load();
