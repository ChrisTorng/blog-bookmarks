import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORY_GUIDANCE,CLASSIFIER_MODEL,parseSuggestedTags,mergeBookmarkTags,suggestBookmarkTags} from '../src/classify.js';

const categories=[
  {id:'ai',name:'AI',name_zh:'人工智慧'},
  {id:'programming',name:'Programming',name_zh:'程式開發'},
  {id:'world',name:'World',name_zh:'國際'},
  {id:'future',name:'Future',name_zh:'未來'},
];

test('the model vocabulary uses stable category ids',()=>{
  assert.ok(CATEGORY_GUIDANCE.programming);
  assert.ok(CLASSIFIER_MODEL.includes('gemma'));
});
test('accepts only known tags, preserves case and removes repeats',()=>{
  assert.deepEqual(parseSuggestedTags({
    choices:[{message:{content:'{"tags":["ai","Programming","UNKNOWN","ai","World","Future"]}'}}]
  },categories),['AI','Programming','World']);
});
test('invalid model JSON is not accepted as a classification',()=>{
  assert.throws(()=>parseSuggestedTags({choices:[{message:{content:'undefined'}}]},categories));
});
test('manual tags are preserved and placeholders are removed when real tags are assigned',()=>{
  assert.deepEqual(mergeBookmarkTags(['Security','default'],['AI','Security']),['Security','AI']);
  assert.deepEqual(mergeBookmarkTags(['default'],[]),['default']);
  assert.deepEqual(mergeBookmarkTags([],['AI','Programming']),['AI','Programming']);
});
test('the classifier reads the current category catalog, omits bad summaries, and disables thinking',async()=>{
  let sent;
  const env={
    DB:{prepare:()=>({all:async()=>({results:categories})})},
    AI:{run:async(model,params)=>{
      sent={model,params};
      return {choices:[{message:{content:'{"tags":["programming","ai"]}'}}]};
    }}
  };
  const tags=await suggestBookmarkTags(env,{url:'https://example.org/story?id=7',title_original:'New AI compiler',summary:'請啟用 JavaScript 並允許 Cookie'});
  assert.deepEqual(tags,['Programming','AI']);
  assert.equal(sent.params.chat_template_kwargs.enable_thinking,false);
  assert.ok(sent.params.messages[0].content.includes('標籤'));
  const metadata=JSON.parse(sent.params.messages[1].content);
  assert.equal(metadata.summary,'');
  assert.equal(metadata.url_path,'example.org/story');
});
