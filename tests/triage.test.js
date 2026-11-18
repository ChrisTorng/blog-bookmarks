import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewTriage,extractArticle,countText,triageList,TRIAGE_VERSION} from '../src/triage.js';

const sample={id:'11111111-1111-4111-a111-111111111111',title:'新聞：服務異常',title_original:'Service incident',summary:'今天服務出現異常，已恢復。',url:'https://example.com/incident',created_at:'2026-11-13T08:00:00Z',stage:0,deferred:0};
test('triage initial scores are bounded and do not present short summary as short article',()=>{
 const x=previewTriage(sample);
 assert.ok(x.score>=0&&x.score<=100);
 assert.equal(x.basis,'rules');
 assert.equal(x.full_chars,null);
 assert.equal(x.read_minutes,null);
 assert.ok(!x.flags.includes('內容過短'));
 assert.deepEqual(Object.keys(x.dimensions).sort(),['depth','durability','fit','learning','novelty']);
});
test('document text extraction removes scripts and navigation and keeps article body',()=>{
 const html='<html><body><nav>首頁 目錄</nav><article><h1>測試文章</h1><p>第一段&amp;第二段</p><script>ignoreMe()</script><p>第三段</p></article><footer>頁尾</footer></body></html>';
 const body=extractArticle(html);
 assert.match(body,/測試文章/);
 assert.match(body,/第一段&第二段/);
 assert.match(body,/第三段/);
 assert.doesNotMatch(body,/ignoreMe|首頁|頁尾|<p>/);
});
test('reading count distinguishes CJK characters and latin words',()=>{
 const stats=countText('Hello world。你好世界！');
 assert.equal(stats.words,6);
 assert.ok(stats.chars>=12);
 assert.equal(stats.minutes,1);
});
test('triage list returns only undecided records and provisional score',async()=>{
 const db={prepare(sql){
  assert.match(sql,/b\.stage IN \(0,1\)/);
  assert.match(sql,/b\.deferred=0/);
  return {bind(prefix){assert.equal(prefix,TRIAGE_VERSION+':');return {all:async()=>({results:[{...sample,saved:null}]})};}};
 }};
 const value=await triageList(db);
 assert.equal(value.total,1);
 assert.equal(value.assessed,0);
 assert.equal(value.items[0].assessed,false);
 assert.equal(value.items[0].analysis.basis,'rules');
});
test('admin triage APIs enforce admin auth and do not change state during scoring',()=>{
 const api=readFileSync(new URL('../src/api.js',import.meta.url),'utf8');
 const model=readFileSync(new URL('../src/data.js',import.meta.url),'utf8');
 assert.match(api,/privateApi && !await isAdmin\(req,env\)/);
 for(const route of ['/triage','/triage/score','/triage/inspect','/triage/paste'])assert.ok(api.includes(route));
 assert.match(model,/if\(\[3,4\]\.includes\(desired\).*needsSummaryRepair/);
});
