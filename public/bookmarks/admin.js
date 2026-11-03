const $=id=>document.getElementById(id);
const local=['localhost','127.0.0.1'].includes(location.hostname);
const key='blog-bookmarks-admin-token';
const state={filter:'unread',sort:'new',page:1,tag:'',q:'',items:[],tags:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function headers(){const h={};if(local&&sessionStorage.getItem(key))h.Authorization='Bearer '+sessionStorage.getItem(key);return h;}
async function request(path,method='GET',body){
 const r=await fetch('/bookmarks/api/admin'+path,{method,headers:{...headers(),...(body?{'Content-Type':'application/json'}:{})},credentials:'same-origin',body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const x=await r.json().catch(()=>({error:'伺服器回應格式錯誤'}));
 if(!r.ok)throw Error(x.error||'HTTP '+r.status);
 return x;
}
function status(msg,error=false){$('message').textContent=msg;$('message').className=error?'error':'';}
function options(){return ['filter','sort','tag','q','page'].map(k=>encodeURIComponent(k)+'='+encodeURIComponent(state[k])).join('&');}
function itemsHtml(items){
 return items.map(b=>'<article class="item" data-id="'+esc(b.id)+'"><a class="title" href="'+esc(b.url)+'" target="_blank" rel="noopener noreferrer" data-read="'+esc(b.id)+'">'+esc(b.title)+'</a><div class="meta">'+esc(new Date(b.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))+' · '+esc(new URL(b.url).hostname)+'</div>'+(b.summary?'<p class="summary">'+esc(b.summary)+'</p>':'')+'<div class="meta">'+b.tags.map(t=>'#'+esc(t)).join(' ')+'</div><div class="actions">'+[1,2,3].map((level,i)=>'<label><input type="checkbox" data-level="'+level+'"'+(b.status>=level?' checked':'')+'> '+['已讀','公開','推薦'][i]+'</label>').join('')+'<button data-edit>編輯</button><a href="/notes/editor/?bookmark='+encodeURIComponent(b.id)+'" target="_blank" rel="noopener">寫隨筆 ↗</a></div></article>').join('');
}
async function refresh(){
 try{
  status('載入中');
  const [data,tags]=await Promise.all([request('/?'+options()),request('/tags')]);
  state.items=data.items;state.tags=tags;
  $('items').innerHTML=itemsHtml(data.items)||'<p>此篩選沒有書籤。</p>';
  $('pager').innerHTML='<button id="prev" '+(data.page===1?'disabled':'')+'>上一頁</button><span>第 '+data.page+'/'+data.pages+' 頁 · '+data.total+' 筆</span><button id="next" '+(data.page>=data.pages?'disabled':'')+'>下一頁</button>';
  $('prev').onclick=()=>{state.page--;refresh();};$('next').onclick=()=>{state.page++;refresh();};
  $('tag').innerHTML='<option value="">全部標籤</option>'+tags.map(t=>'<option value="'+esc(t.id)+'"'+(state.tag===t.id?' selected':'')+'>'+esc(t.name)+' ('+t.count+')</option>').join('');
  status('');
 }catch(e){status(e.message,true);}
}
function edit(item){
 const d=$('editDialog');$('editId').value=item?.id||'';$('editTitle').value=item?.title||'';$('editUrl').value=item?.url||'';$('editSummary').value=item?.summary||'';$('editTags').value=item?.tags?.join(', ')||'';d.showModal();
}
$('app').innerHTML='<header><h1>書籤管理</h1><a href="/bookmarks/" target="_blank">公開列表 ↗</a></header><div class="auth" id="auth"></div><form class="filters" id="filters"><select id="filter"><option value="unread">未讀</option><option value="read">已讀</option><option value="all">全部</option><option value="published">公開</option><option value="starred">推薦</option></select><select id="tag"><option value="">全部標籤</option></select><select id="sort"><option value="new">最新</option><option value="old">最舊</option><option value="recommended">推薦優先</option><option value="title">標題</option></select><input id="q" placeholder="搜尋標題、網址、摘要"><button>篩選</button><button id="new" type="button">新增</button></form><div id="message" role="status" aria-live="polite"></div><div id="items"></div><nav class="pager" id="pager"></nav><dialog id="editDialog"><form id="editForm"><h2>編輯書籤</h2><input id="editId" type="hidden"><label>標題<input id="editTitle" required maxlength="500"></label><label>網址<input id="editUrl" type="url" required></label><label>摘要<textarea id="editSummary" maxlength="5000"></textarea></label><label>標籤（逗號分隔）<input id="editTags"></label><div><button type="submit">儲存</button><button type="button" id="cancelEdit">取消</button><button type="button" id="deleteItem">刪除</button></div></form></dialog>';
if(local){
 $('auth').innerHTML='<input id="token" type="password" placeholder="本機管理 Token"><button id="login">登入</button><span class="hint">只儲存在此分頁</span>';
 $('token').value=sessionStorage.getItem(key)||'';
 $('login').onclick=()=>{sessionStorage.setItem(key,$('token').value);refresh();};
}
$('filters').onsubmit=e=>{e.preventDefault();state.filter=$('filter').value;state.tag=$('tag').value;state.sort=$('sort').value;state.q=$('q').value;state.page=1;refresh();};
$('new').onclick=()=>edit(null);
$('cancelEdit').onclick=()=>$('editDialog').close();
$('items').addEventListener('click',async e=>{
 const node=e.target.closest('[data-read]');if(!node)return;
 const b=state.items.find(x=>x.id===node.dataset.read);
 if(b&&b.status===0){request('/'+b.id,'PATCH',{status:1}).then(refresh).catch(err=>status(err.message,true));}
});
$('items').addEventListener('change',async e=>{
 const control=e.target.closest('[data-level]');if(!control)return;
 const b=state.items.find(x=>x.id===control.closest('[data-id]').dataset.id);
 if(!b)return;
 const level=Number(control.dataset.level);
 const target=control.checked?Math.max(b.status,level):Math.min(b.status,level-1);
 try{await request('/'+b.id,'PATCH',{status:target});await refresh();}catch(err){status(err.message,true);refresh();}
});
$('items').addEventListener('click',e=>{
 const button=e.target.closest('[data-edit]');if(button)edit(state.items.find(x=>x.id===button.closest('[data-id]').dataset.id));
});
$('editForm').onsubmit=async e=>{
 e.preventDefault();const id=$('editId').value,body={title:$('editTitle').value,url:$('editUrl').value,summary:$('editSummary').value,tags:$('editTags').value.split(',').map(x=>x.trim()).filter(Boolean)};
 try{await request(id?'/'+id:'',id?'PATCH':'POST',body);$('editDialog').close();refresh();}catch(err){status(err.message,true);}
};
$('deleteItem').onclick=async()=>{
 const id=$('editId').value;if(!id||!confirm('確定刪除此書籤？'))return;
 try{await request('/'+id,'DELETE');$('editDialog').close();refresh();}catch(err){status(err.message,true);}
};
refresh();


const tokenTools=document.createElement('div');
tokenTools.className='token-tools';
tokenTools.innerHTML='<button id="generateToken" type="button">產生 Tampermonkey Token</button><span class="hint"> 新 Token 產生後，舊 Token 立即失效。</span><div id="tokenResult" hidden><input id="tokenValue" readonly aria-label="一次性新增 Token"><button id="copyToken" type="button">複製 Token</button></div>';
$('auth').after(tokenTools);
$('generateToken').onclick=async()=>{
 if(!confirm('確定產生新的 Tampermonkey Token？舊 Token 將失效。'))return;
 try{
  const result=await request('/ingest-token','POST',{});
  $('tokenValue').value=result.token;
  $('tokenResult').hidden=false;
  status('已產生 Token。請複製至 Tampermonkey，離開後不再顯示。');
 }catch(e){status(e.message,true);}
};
$('copyToken').onclick=async()=>{
 try{await navigator.clipboard.writeText($('tokenValue').value);status('Token 已複製');}
 catch{ $('tokenValue').select();status('請手動複製選取的 Token');}
};
