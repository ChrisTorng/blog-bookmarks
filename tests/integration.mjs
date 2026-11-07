import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import assert from 'node:assert/strict';
const root='http://127.0.0.1:8788';
const password='bookmarks-local-ci-auth-token-2026';
const devVars='.dev.vars';
writeFileSync(devVars,'AUTH_MODE=local\nLOCAL_ADMIN_TOKEN='+password+'\nBLOG_SHELL_URL=\n');
const windows=process.platform==='win32';
const child=spawn(windows?'npx.cmd':'npx',['wrangler','dev','--local','--port','8788','--infer-origin-from-routes=false','--var','AUTH_MODE:local','--var','LOCAL_ADMIN_TOKEN:'+password,'--var','BLOG_SHELL_URL:'],{stdio:['ignore','pipe','pipe'],detached:!windows,shell:windows});
let output='';
child.stdout.on('data',v=>output+=v.toString());
child.stderr.on('data',v=>output+=v.toString());
async function req(path,method='GET',body,authorized=false,extraHeaders={}){
 const response=await fetch(root+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(authorized?{Authorization:'Bearer '+password}:{}),...extraHeaders},body:body?JSON.stringify(body):undefined});
 const text=await response.text();
 return {status:response.status,text,body:(()=>{try{return JSON.parse(text)}catch{return null}})()};
}
try{
 let ready=false;
 for(let n=0;n<100;n++){
  try{if((await req('/bookmarks/api/')).status===200){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert(ready,'Worker did not start: '+output.slice(-2500));
 assert.equal((await req('/bookmarks/api/admin/')).status,401);
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 const denied=await req('/bookmarks/api/ingest','POST',{url:'https://test.example/test',title:'denied'});
 assert.equal(denied.status,401);
 const created=await req('/bookmarks/api/admin/','POST',{url:'https://example.org/sample?keep=1#fragment',title:'Sample article',summary:'Imported description',tags:['AI','AI']},true);
 assert.equal(created.status,201,created.text+'\nWorker output: '+output.slice(-1200));
 assert.equal(created.body.item.status,0);
 const initialQuick=await req('/bookmarks/api/admin/quick?size=6','GET',undefined,true);
 assert.equal(initialQuick.status,200,initialQuick.text);
 assert.equal(initialQuick.body.size,6);
 assert.equal(initialQuick.body.remaining,1);
 assert.equal(initialQuick.body.pending[0].id,created.body.item.id);
 const largerQuick=await req('/bookmarks/api/admin/quick?size=10','GET',undefined,true);
 assert.equal(largerQuick.body.size,10);
 const invalidSize=await req('/bookmarks/api/admin/quick?size=100','GET',undefined,true);
 assert.equal(invalidSize.body.size,3);
 // Deferred items are private and do not block the oldest pending queue.
 const deferred=await req('/bookmarks/api/admin/','POST',{
  url:'https://example.org/deferred-study',title:'Read this paper later'
 },true);
 assert.equal(deferred.status,201);
 const deferredId=deferred.body.item.id;
 const deferredResponse=await req('/bookmarks/api/admin/'+deferredId,'PATCH',{status:5},true);
 assert.equal(deferredResponse.status,200,deferredResponse.text);
 assert.equal(deferredResponse.body.status,5);
 assert.equal((await req('/bookmarks/api/'+deferredId)).status,404);
 assert.equal((await req('/bookmarks/api/admin/?filter=deferred','GET',undefined,true)).body.total,1);
 assert.equal((await req('/bookmarks/api/admin/?filter=pending','GET',undefined,true)).body.total,1);
 const deferredQuick=await req('/bookmarks/api/admin/quick?size=3','GET',undefined,true);
 assert.equal(deferredQuick.body.deferredRemaining,1);
 assert.equal(deferredQuick.body.deferred[0].id,deferredId);
 assert.equal(deferredQuick.body.remaining,1);
 const restored=await req('/bookmarks/api/admin/'+deferredId,'PATCH',{status:2},true);
 assert.equal(restored.body.status,2);
 assert.equal((await req('/bookmarks/api/admin/?filter=deferred','GET',undefined,true)).body.total,0);
 assert.equal((await req('/bookmarks/api/admin/'+deferredId,'DELETE',undefined,true)).body.deleted,true);
 // A newer unread bookmark must not preempt older pending items.
 const newer=await req('/bookmarks/api/admin/','POST',{
  url:'https://example.org/newer-pending',title:'Newer undecided bookmark'
 },true);
 assert.equal(newer.status,201);
 const quickOldest=await req('/bookmarks/api/admin/quick?size=6','GET',undefined,true);
 assert.deepEqual(quickOldest.body.pending.slice(0,2).map(x=>x.id),[created.body.item.id,newer.body.item.id]);
 const fullOldest=await req('/bookmarks/api/admin/?filter=pending','GET',undefined,true);
 assert.deepEqual(fullOldest.body.items.slice(0,2).map(x=>x.id),[created.body.item.id,newer.body.item.id]);
 const explicitlyNewest=await req('/bookmarks/api/admin/?filter=pending&sort=new','GET',undefined,true);
 assert.deepEqual(explicitlyNewest.body.items.slice(0,2).map(x=>x.id),[newer.body.item.id,created.body.item.id]);
 assert.equal((await req('/bookmarks/api/admin/'+newer.body.item.id,'DELETE',undefined,true)).body.deleted,true);
 const untagged=await req('/bookmarks/api/admin/','POST',{
  url:'https://example.org/uncategorized',title:'Uncategorized'
 },true);
 const untaggedId=untagged.body.item.id;
 const deniedPublic=await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{status:3},true);
 assert.equal(deniedPublic.status,400,deniedPublic.text);
 assert.match(deniedPublic.body.error,/分類/);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{status:4},true)).status,400);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{status:2},true)).body.status,2);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{status:3,tags:['Science']},true)).body.status,3);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{tags:[]},true)).status,400);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'PATCH',{status:2,tags:[]},true)).body.status,2);
 assert.equal((await req('/bookmarks/api/admin/'+untaggedId,'DELETE',undefined,true)).body.deleted,true);
 const tagUpdate=await req('/bookmarks/api/admin/tags/ai','PATCH',{name:'AI Research',name_zh:'人工智慧'},true);
 assert.equal(tagUpdate.status,200,tagUpdate.text);
 assert.equal(tagUpdate.body.id,'ai');
 const tags=await req('/bookmarks/api/admin/tags','GET',undefined,true);
 assert.equal(tags.body.find(t=>t.id==='ai').name_zh,'人工智慧');
 const id=created.body.item.id;
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 const again=await req('/bookmarks/api/admin/','POST',{url:'https://example.org/sample?keep=1',title:'duplicate'},true);
 assert.equal(again.body.alreadyExists,true);
 const read=await req('/bookmarks/api/admin/'+id,'PATCH',{status:1},true);
 assert.equal(read.body.status,1);
 assert.equal((await req('/bookmarks/api/admin/?filter=pending','GET',undefined,true)).body.total,1);
 assert.equal((await req('/bookmarks/api/admin/?filter=unread','GET',undefined,true)).body.total,0);
 assert.equal((await req('/bookmarks/api/admin/?filter=readPending','GET',undefined,true)).body.total,1);
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 const madePrivate=await req('/bookmarks/api/admin/'+id,'PATCH',{status:2},true);
 assert.equal(madePrivate.body.status,2);
 const recentlyProcessed=await req('/bookmarks/api/admin/quick?size=6','GET',undefined,true);
 assert.equal(recentlyProcessed.body.remaining,0);
 assert.equal(recentlyProcessed.body.recent.at(-1).id,id);
 assert.equal((await req('/bookmarks/api/admin/?filter=pending','GET',undefined,true)).body.total,0);
 assert.equal((await req('/bookmarks/api/admin/?filter=private','GET',undefined,true)).body.total,1);
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 assert.equal((await req('/bookmarks/feed.xml')).text.includes('Sample article'),false);
 const published=await req('/bookmarks/api/admin/'+id,'PATCH',{status:3},true);
 assert.equal(published.body.status,3);
 assert.equal((await req('/bookmarks/api/')).body.total,1);
 assert.match((await req('/bookmarks/feed.xml')).text,/Sample article/);
 assert.match((await req('/bookmarks/feed.xml?tag=ai')).text,/人工智慧 · 書籤 RSS/);
 const publicApi=(await req('/bookmarks/api/')).body;
 assert.equal(publicApi.items.length,1);
 assert.match(publicApi.items[0].created_at,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(publicApi.items[0].read_at,null);
 assert.match(publicApi.items[0].status_at,/^\d{4}-\d{2}-\d{2}$/);
 assert.equal((await req('/bookmarks/api/?q=Sample')).body.total,1);
 assert.equal((await req('/bookmarks/api/?q=not-found-987654')).body.total,0);
 assert.equal((await req('/bookmarks/api/?from=2099-01-01')).body.total,0);
 assert.equal((await req('/bookmarks/api/?to=1999-01-01')).body.total,0);
 assert.equal((await req('/bookmarks/api/?from=1999-01-01&to=2099-12-31')).body.total,1);
 assert.equal((await req('/bookmarks/filters.js')).status,404);
 assert.equal((await req('/bookmarks/')).status,404);
 assert.equal((await req('/bookmarks/?tag=ai')).status,404);
 const publicDetail=await req('/bookmarks/api/'+id);
 assert.equal(publicDetail.status,200);
 assert.equal(publicDetail.body.id,id);
 assert.match(publicDetail.body.status_at,/^\d{4}-\d{2}-\d{2}$/);
 const starred=await req('/bookmarks/api/admin/'+id,'PATCH',{status:4},true);
 assert.equal(starred.body.status,4);
 const rotated=await req('/bookmarks/api/admin/ingest-token','POST',{},true);
 assert.equal(rotated.status,200,rotated.text);
 assert.match(rotated.body.token,/^[a-f0-9]{64}$/);
 const check=await req('/bookmarks/api/ingest/status','POST',{urls:['https://example.org/sample?keep=1']},false,{Authorization:'Bearer '+rotated.body.token});
 assert.equal(check.status,200,check.text);
 assert.equal(check.body[0].status,4);
 const unstarred=await req('/bookmarks/api/admin/'+id,'PATCH',{status:3},true);
 assert.equal(unstarred.body.status,3);
 const privateAgain=await req('/bookmarks/api/admin/'+id,'PATCH',{status:2},true);
 assert.equal(privateAgain.body.status,2);
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 assert.equal((await req('/bookmarks/api/'+id)).status,404);
 const hidden=await req('/bookmarks/api/admin/'+id,'PATCH',{status:0},true);
 assert.equal(hidden.body.status,0);
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 assert.equal((await req('/bookmarks/feed.xml')).text.includes('Sample article'),false);
 const deleted=await req('/bookmarks/api/admin/'+id,'DELETE',undefined,true);
 assert.equal(deleted.body.deleted,true);
 console.log('Integration tests passed: auth, private queue, status transitions, URL de-duplication, RSS and ingest token.');
}finally{
 if(windows)child.kill();
 else {try{process.kill(-child.pid,'SIGTERM')}catch{child.kill()}}
 try{unlinkSync(devVars)}catch{}
}
