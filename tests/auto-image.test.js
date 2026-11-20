import test from 'node:test';
import assert from 'node:assert/strict';
import {readSocialImages,selectPublisherImage,autoCompleteImage} from '../src/auto-image.js';

const article='https://example.org/stories/chip';
const item={id:'abc',url:article,title:'Vintage chip research',title_original:'Reverse engineering a vintage chip',summary:'An electronics engineer examined a 1960s chip.'};
function html({url='https://cdn.example.org/photo.jpg',width=1200,height=630,title='Reverse engineering a vintage chip'}={}){
 return '<html><head><meta content="'+url+'" property="og:image">'+
  '<meta property="og:image:width" content="'+width+'">'+
  '<meta content="'+height+'" property="og:image:height">'+
  '<meta property="og:title" content="'+title+'">'+
  '<meta property="og:url" content="'+article+'"></head></html>';
}
const page=(source)=>async()=>new Response(source,{headers:{'content-type':'text/html'}});
test('extracts explicit publisher image with arbitrary meta attribute ordering',()=>{
 const result=readSocialImages(html(),article);
 assert.equal(result.image_url,'https://cdn.example.org/photo.jpg');
 assert.equal(result.width,1200);
 assert.equal(result.height,630);
});
test('rejects icons, tiny cards and pages without image metadata',()=>{
 assert.equal(readSocialImages('<title>News</title>',article),null);
 assert.equal(readSocialImages(html({url:'https://example.org/favicon.png'}),article),null);
 assert.equal(readSocialImages(html({url:'https://example.org/logo.png'}),article),null);
 assert.equal(readSocialImages(html({width:80,height:80}),article),null);
 assert.equal(readSocialImages(html({url:'javascript:alert(1)'}),article),null);
 assert.equal(readSocialImages(html({url:'http://example.org/picture.jpg'}),article),null);
});
test('accepts article-specific verified image when vision is unavailable',async()=>{
 assert.equal(await selectPublisherImage({},item,page(html())),'https://cdn.example.org/photo.jpg');
});
test('visual model YES accepts a matching image',async()=>{
 const env={AI:{run:async(model,args)=>{
  assert.equal(model,'@cf/moondream/moondream3.1-9B-A2B');
  assert.match(args.question,/vintage chip/i);
  return {answer:'YES'};}}};
 assert.equal(await selectPublisherImage(env,item,page(html())),'https://cdn.example.org/photo.jpg');
});
test('visual model NO overrides website image metadata',async()=>{
 assert.equal(await selectPublisherImage({AI:{run:async()=>({answer:'NO'})}},item,page(html())),null);
});
test('does not trust a page with a different canonical article',async()=>{
 const source=html().replace(article+'"','https://example.org/stories/other"');
 assert.equal(await selectPublisherImage({},item,page(source)),null);
});
test('stores only missing images and records lookup completion',async()=>{
 const writes=[];
 const env={DB:{prepare(sql){return {bind(...args){return {run:async()=>{writes.push({sql,args});return {meta:{changes:1}};}}}}}}};
 const result=await autoCompleteImage(env,item,page(html()));
 assert.equal(result.saved,true);
 assert.equal(writes.length,1);
 assert.equal(writes[0].args[0],'https://cdn.example.org/photo.jpg');
 assert.match(writes[0].sql,/image_suppressed=0/);
 assert.equal((await autoCompleteImage(env,{...item,image_url:'https://example.org/manual.jpg'},page(html()))).saved,false);
 assert.equal(writes.length,1);
});
