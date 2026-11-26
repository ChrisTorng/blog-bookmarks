import test from 'node:test';
import assert from 'node:assert/strict';
import {readingStatsHtml} from '../src/public-content.js';
test('RSS-compatible inline bar paints the reduction at the right',()=>{
 const html=readingStatsHtml({original:{chars:923},summary_metrics:{chars:533},reduction_percent:42});
 assert.match(html,/width="58%" bgcolor="#64748b".*width="42%" bgcolor="#22a06b"/);
 assert.match(html,/原文 923 字.*摘要 533 字.*縮減 42%/);
 assert.doesNotMatch(html,/分鐘|英文單字|中文字/);
});
test('zero, full, negative and unknown reductions remain accurate',()=>{
 for(const r of [0,-20,null]){
  const html=readingStatsHtml({original:{chars:100},summary_metrics:{chars:120},reduction_percent:r});
  assert.doesNotMatch(html,/#22a06b/);
 }
 assert.match(readingStatsHtml({original:{chars:100},summary_metrics:{chars:0},reduction_percent:100}),/width="100%" bgcolor="#22a06b"/);
});
