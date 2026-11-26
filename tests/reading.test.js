import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticReading,readingMetrics,reserveEstimate,fetchReadingText,collectReadingStream} from '../src/reading.js';
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

test('Workers AI stream supports split UTF8, native chunks and OpenAI deltas',async()=>{
 const encoder=new TextEncoder();
 const value=encoder.encode('data: {"choices":[{"delta":{"content":"繁體"}}]}\n\ndata: {"response":"中文"}\n\ndata: {"usage":{"prompt_tokens":100,"completion_tokens":4}}\n\ndata: [DONE]\n\n');
 const stream=new ReadableStream({start(c){for(let i=0;i<value.length;i+=7)c.enqueue(value.slice(i,i+7));c.close();}});
 let visible='';
 const r=await collectReadingStream(stream,x=>{visible+=x});
 assert.equal(r.answer,'繁體中文');assert.equal(visible,r.answer);assert.equal(r.usage.completion_tokens,4);
});
test('incomplete or length-limited streams are not considered valid summaries',async()=>{
 for(const event of ['data: {"response":"partial"}\n\n','data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n']){
  await assert.rejects(()=>collectReadingStream(new Response(event).body));
 }
});
