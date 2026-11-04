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
 assert.equal((await req('/bookmarks/api/')).body.total,0);
 const published=await req('/bookmarks/api/admin/'+id,'PATCH',{status:2},true);
 assert.equal(published.body.status,2);
 assert.equal((await req('/bookmarks/api/')).body.total,1);
 assert.match((await req('/bookmarks/feed.xml')).text,/Sample article/);
 assert.match((await req('/bookmarks/feed.xml?tag=ai')).text,/人工智慧書籤 RSS 訂閱/);
 assert.match((await req('/bookmarks/?tag=ai')).text,/人工智慧/);
 const starred=await req('/bookmarks/api/admin/'+id,'PATCH',{status:3},true);
 assert.equal(starred.body.status,3);
 const rotated=await req('/bookmarks/api/admin/ingest-token','POST',{},true);
 assert.equal(rotated.status,200,rotated.text);
 assert.match(rotated.body.token,/^[a-f0-9]{64}$/);
 const check=await req('/bookmarks/api/ingest/status','POST',{urls:['https://example.org/sample?keep=1']},false,{Authorization:'Bearer '+rotated.body.token});
 assert.equal(check.status,200,check.text);
 assert.equal(check.body[0].status,3);
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
