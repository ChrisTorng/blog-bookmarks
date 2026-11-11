import test from 'node:test';
import assert from 'node:assert/strict';
import {needsSummaryRepair,summarizeSubmittedArticle} from '../src/summary-repair.js';

test('flags empty and blocked snippets but not articles about JavaScript or CAPTCHA',()=>{
  for(const s of [
    '', '抱歉', '請啟用 JS 並關閉任何廣告攔截器',
    '繼續操作，請登入你的 Reddit 帳號或使用開發者代幣。',
    'Google 系統偵測到來自你電腦網路的異常流量，請解開 CAPTCHA 後再繼續。',
    '你沒有權限存取這個伺服器上的頁面。',
    '常見漏洞與暴露（CVE）'
  ])assert.equal(needsSummaryRepair(s),true,s);
  for(const s of [
    '研究發現惡意 JavaScript 會在網頁中載入，並藉此執行跨站請求偽造攻擊。',
    '新研究指出 CAPTCHA 驗證可被自動化系統使用假帳號繞過，目前已有多家網站受影響。',
    'Google 的新功能利用 JavaScript 和 Cookies 提升瀏覽器端效能並控制載入順序。'
  ])assert.equal(needsSummaryRepair(s),false,s);
});

test('summarizes submitted text and only returns the AI result',async()=>{
  const prompts=[];
  const env={AI:{run:async (_model,args)=>{
    prompts.push(args);
    return {response:JSON.stringify({summary:'這篇文章比較不同實作的效能與技術取捨，並對實驗方法和結果提出了具體分析。'})};
  }}};
  const item={title:'範例技術報告',url:'https://example.org/post'};
  const got=await summarizeSubmittedArticle(env,item,'原文內容。'.repeat(20));
  assert.match(got,/實驗方法/);
  assert.equal(prompts.length,1);
  assert.match(prompts[0].messages[1].content,/原文內容/);
});

test('rejects failed-page text before asking AI',async()=>{
  const env={AI:{run:async()=>{throw Error('Unexpected AI call')}}};
  await assert.rejects(()=>summarizeSubmittedArticle(env,{title:'Article'},'請啟用 JS 並關閉任何廣告攔截器'.repeat(10)),/疑似/);
});
