import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReading,readingMetrics,reserveEstimate,fetchReadingText} from '../src/reading.js';
test('automatic threshold uses reading duration and known low score',()=>{
 assert.equal(automaticReading(3,10),false);
 assert.equal(automaticReading(8,59),true);
 assert.equal(automaticReading(8,60),false);
 assert.equal(automaticReading(8,null),false);
 assert.equal(automaticReading(15,95),true);
});
test('counts CJK and English separately',()=>{
 const r=readingMetrics('中文測試 hello world');
 assert.equal(r.cjk,4);assert.equal(r.english,2);assert.equal(r.words,6);
});
test('reservation grows with length',()=>assert.ok(reserveEstimate('hello '.repeat(1000))>reserveEstimate('hello')));
test('prefetch rejects challenge, paywall, and missing article',async()=>{
 for(const html of ['<title>Just a moment</title><main>'+ 'hello '.repeat(50)+'</main>','<div>'+ 'hello '.repeat(50)+'</div>','<script>{"isAccessibleForFree":false}</script><article>'+ 'hello '.repeat(50)+'</article>']){
  assert.equal(await fetchReadingText('https://example.com/post',async()=>new Response(html,{headers:{'content-type':'text/html'}})),null);
 }
});
test('prefetch reads full short article',async()=>{
 const html='<article><p>'+'A useful article with concrete examples. '.repeat(8)+'</p></article>';
 const result=await fetchReadingText('https://example.com/post',async()=>new Response(html,{headers:{'content-type':'text/html'}}));
 assert.ok(result?.includes('concrete examples'));
});
