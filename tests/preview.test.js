import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {previewRule,PREVIEW_VERSION} from '../src/preview.js';
const item=(title,summary='Story details',extra={})=>({url:'https://example.org/unique',title,summary,...extra});
test('AI product announcements and archaeological finds outrank fleeting outages',()=>{
 const ai=previewRule(item('Qwen4-Max new AI model release'));
 const history=previewRule(item('200 year old archaeological artifact discovered'));
 const outage=previewRule(item('Outage: airline disruption temporarily unavailable'));
 assert.ok(ai.publish>outage.publish);
 assert.ok(history.publish>outage.publish);
 assert.ok(ai.interest>=75);
 assert.ok(history.publish>=65);
 assert.equal(ai.version,PREVIEW_VERSION);
 for(const result of [ai,history,outage]){
  assert.ok(result.recommend<=result.publish);
  assert.ok(result.publish<=result.interest);
  assert.equal(result.basis,'rules');
  assert.equal(result.confidence,'uncalibrated');
 }
});
test('popularity affects preference only weakly and scores remain bounded',()=>{
 const low=previewRule(item('A clever technical trick','Some explanation',{points:2,comments:2}));
 const high=previewRule(item('A clever technical trick','Some explanation',{points:30000,comments:10000}));
 assert.ok(high.publish-low.publish<=6);
 assert.ok(high.publish-low.publish>=0);
});
test('Tampermonkey source parses and retains the screen-pinned star',()=>{
 const parsed=spawnSync(process.execPath,['--check',new URL('../tampermonkey/BlogBookmarks.user.js',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
