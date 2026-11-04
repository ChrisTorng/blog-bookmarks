import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/bookmarks/admin.js',import.meta.url),'utf8');
const prefix=source.slice(0,source.indexOf('const esc ='));

function simulate(address){
 const location={href:address,search:new URL(address).search,hostname:new URL(address).hostname};
 const fields={}, historyCalls=[],scrolls=[];
 const history={state:null,pushState(_s,_t,next){setUrl('push',next)},replaceState(_s,_t,next){setUrl('replace',next)}};
 function setUrl(method,url){historyCalls.push(method);location.href=url;location.search=new URL(url).search;}
 const context={location,URL,URLSearchParams,history,document:{getElementById(id){return fields[id]??={value:''}}},window:{scrollTo(x){scrolls.push(x)}}};
 vm.runInNewContext(prefix+'\nfunction refresh(){return Promise.resolve()}\nglobalThis.view=()=>state;globalThis.move=navigate;globalThis.show=syncControls;',context);
 return {context,location,fields,historyCalls,scrolls};
}
test('reload reads filters and page from URL',()=>{
 const h=simulate('https://example.org/bookmarks/admin/?filter=read&sort=title&tag=ai&q=LLM&page=4');
 assert.equal(h.context.view().filter,'read');
 assert.equal(h.context.view().sort,'title');
 assert.equal(h.context.view().tag,'ai');
 assert.equal(h.context.view().q,'LLM');
 assert.equal(h.context.view().page,4);
 h.context.show();
 assert.equal(h.fields.filter.value,'read');
 assert.equal(simulate(h.location.href).context.view().page,4);
});
test('page navigation preserves filter, moves to top, and writes browser history',()=>{
 const h=simulate('https://example.org/bookmarks/admin/?filter=unread&sort=old&tag=security&page=2');
 h.context.move({page:3},{scrollTop:true});
 const params=new URL(h.location.href).searchParams;
 assert.equal(params.get('page'),'3');
 assert.equal(params.get('sort'),'old');
 assert.equal(params.get('tag'),'security');
 assert.equal(h.historyCalls[0],'push');
 assert.equal(h.scrolls[0].top,0);
});
test('changing filter resets page and clears only in-memory review pins',()=>{
 const h=simulate('https://example.org/bookmarks/admin/?filter=unread&page=6');
 h.context.view().pending.set('b1',true);
 h.context.move({filter:'published',page:1},{scrollTop:true});
 assert.equal(h.context.view().pending.size,0);
 assert.equal(new URL(h.location.href).searchParams.get('filter'),'published');
 assert.equal(new URL(h.location.href).searchParams.has('page'),false);
});
test('back/forward and stale response protection are present',()=>{
 assert.match(source,/window\.addEventListener\('popstate'/);
 assert.match(source,/Object\.assign\(state,readLocationState\(\)\)/);
 assert.match(source,/navigate\(\{page:state\.page\+1\},\{scrollTop:true\}\)/);
 assert.match(source,/if\(generation!==refreshGeneration\)return/);
 assert.match(source,/if\(state\.page>data\.pages\)/);
});
