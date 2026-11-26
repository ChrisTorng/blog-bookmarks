import test from 'node:test';
import assert from 'node:assert/strict';
import {plainReadingBody,readingInput,linkReadingSections,readingDisplay,attachPublicReading} from '../src/reading-format.js';
import {extractArticle} from '../src/triage.js';

test('source sections preserve order and only link captured anchors',()=>{
 const input=readingInput('Intro\n## [id:real%20id] First heading\nBody\n### Other heading\nMore\n## Repeat heading\nOne\n## Repeat heading\nTwo');
 assert.equal(input.headings.length,4);
 assert.match(input.text,/## \[S1\] First heading/);
 assert.equal(plainReadingBody('## [id:real%20id] First heading'),'First heading');
 const result=linkReadingSections('## [S1] 第一節\n摘要\n## [S2] 第二節\n摘要\n## [S3] 第三節\n## [S9] 未知',input.headings,'https://example.com/post');
 assert.match(result,/\[第一節\]\(https:\/\/example\.com\/post#real%20id\)/);
 assert.match(result,/### \[第二節\]\(https:\/\/example\.com\/post#:~:text=Other%20heading\)/);
 assert.match(result,/## 第三節\n## 未知$/);
});
test('server extraction preserves source headings only when requested',()=>{
 const html='<article><p>Intro</p><h2>First <em>heading</em></h2><p>Body</p></article>';
 assert.match(extractArticle(html,{preserveHeadings:true}),/^Intro\n## First heading\nBody$/);
 assert.doesNotMatch(extractArticle(html),/##/);
});
test('statistics exclude markdown link destinations and stale summaries',()=>{
 const row={url:'https://example.com',chars:100,cjk:0,english:20,words:20,minutes:5,body_hash:'x',summary_hash:'x',summary:'## [標題](https://example.com/very-long-url)\n**中文**'};
 const r=readingDisplay(row);
 assert.equal(r.summary_metrics.chars,4);assert.equal(r.reduction_percent,96);
 assert.equal(readingDisplay({...row,summary_hash:'old'}),null);
});
test('public reading attaches only safe projection with one bounded query',async()=>{
 const row={url:'https://example.com',chars:100,body_hash:'x',summary_hash:'x',summary:'摘要',body:'private full text',captured_at:'private time'};
 let queries=0;
 const db={prepare(sql){queries++;assert.doesNotMatch(sql,/\bbody\b|captured_at/);return {bind(...args){assert.deepEqual(args,[row.url]);return {async all(){return {results:[row]}}}}}}};
 const [item]=await attachPublicReading(db,[{url:row.url}]);
 assert.equal(queries,1);assert.equal(item.reading_summary.summary,'摘要');
 assert.doesNotMatch(JSON.stringify(item),/private/);
});

test('compact statistics use only original, summary and reduction',()=>{
 const r=readingDisplay({chars:923,minutes:2,cjk:383,english:106,body_hash:'x',summary_hash:'x',summary:'中'.repeat(533)});
 assert.deepEqual(r.stats_lines,['原文 923 字','摘要 533 字','縮減 42%']);
});
