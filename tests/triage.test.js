import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewTriage,extractArticle,countText,triageList,TRIAGE_VERSION} from '../src/triage.js';

const sample={id:'11111111-1111-4111-a111-111111111111',title:'新聞：服務異常',title_original:'Service incident',summary:'今天服務出現異常，已恢復，但目前只公布事件原因仍在調查中，尚無進一步技術報告。',url:'https://example.com/incident',created_at:'2026-11-13T08:00:00Z',stage:0,deferred:0};
test('triage initial scores are bounded and do not present short summary as short article',()=>{
 const x=previewTriage(sample);
 assert.ok(x.score>=0&&x.score<=100);
 assert.equal(x.basis,'rules');
 assert.equal(x.full_chars,null);
 assert.equal(x.read_minutes,null);
 assert.ok(!x.flags.includes('內容過短'));
 assert.deepEqual(Object.keys(x.dimensions).sort(),['awareness','depth','durability','fit','learning','novelty']);
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

test('missing or garbled summary must not be ranked as worthless article',()=>{
 for(const summary of ['', '由於提供的內容僅包含網頁技術代碼與樣式設定，並無任何文章正文，因此無法摘要主要事件。']){
  const x=previewTriage({...sample,summary});
  assert.equal(x.basis,'insufficient');
  assert.equal(x.confidence,'none');
  assert.deepEqual(x.flags,['閱讀障礙']);
  assert.equal(x.score,50);
 }
});

test('v2 preview values AI announcements and historical discoveries without requiring tutorials',()=>{
 const props={...sample,created_at:'2026-11-18T00:00:00Z'};
 const ai=previewTriage({...props,title:'Qwen4-Max model release',title_original:'Qwen4-Max',summary:'Qwen4-Max released new model improvements and benchmark comparisons, available now for developers to try.'});
 const past=previewTriage({...props,title:'Historical manuscript discovery',title_original:'An archaeological discovery of a 200 year old manuscript',summary:'An original handwritten manuscript was discovered under old roof tiles; it illuminates historical social customs.'});
 const notice=previewTriage({...props,title:'Airline outage',title_original:'Airline outage disruption and service restored',summary:'A temporary airline service outage was reported; service restored. No explanation or investigation is included.'});
 assert.ok(ai.score>notice.score);
 assert.ok(past.score>notice.score);
 assert.ok(ai.dimensions.awareness>=90);
 assert.ok(past.dimensions.fit>=80);
 assert.ok(!ai.flags.includes('時事過期'));
});
