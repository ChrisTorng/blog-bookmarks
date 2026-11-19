import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

const secret='bookmarks-diagnostics-local-test-token';
const db={prepare(){throw new Error('SQLITE_BUSY: simulated internal D1 read failure');}};

async function failedRequest(path,method='GET'){
 const request=new Request('http://127.0.0.1'+path,{method,headers:{authorization:'Bearer '+secret,'cf-ray':'testRay-TPE'}});
 const original=console.error;
 console.error=()=>{};
 try{
  const response=await api(request,{LOCAL_ADMIN_TOKEN:secret,DB:db},new URL(request.url));
  return {status:response.status,body:await response.json()};
 }finally{console.error=original;}
}

test('list read error is traceable without exposing internal D1 details',async()=>{
 const value=await failedRequest('/bookmarks/api/admin/?filter=pending&sort=old&q='+encodeURIComponent('南韓將發布全國緊急警報'));
 assert.equal(value.status,500);
 assert.equal(value.body.code,'ADMIN_LIST_FAILED');
 assert.equal(value.body.ray,'testRay-TPE');
 assert.equal(value.body.error,'伺服器錯誤');
 assert.ok(!JSON.stringify(value.body).includes('SQLITE_BUSY'));
});

test('tag fetch failures identify the failing endpoint',async()=>{
 const value=await failedRequest('/bookmarks/api/admin/tags');
 assert.equal(value.status,500);
 assert.equal(value.body.code,'ADMIN_TAGS_FAILED');
});
