import test from 'node:test';
import assert from 'node:assert/strict';
import {needsSummaryRepair,summarizeSubmittedArticle} from '../src/summary-repair.js';

test('flags empty and blocked snippets but not articles about JavaScript or CAPTCHA',()=>{
  for(const s of [
    '', '抱歉', '請啟用 JS 並關閉任何廣告攔截器',
    '繼續操作，請登入你的 Reddit 帳號或使用開發者代幣。',
    'Google 系統偵測到來自你電腦網路的異常流量，請解開 CAPTCHA 後再繼續。',
    '你沒有權限存取這個伺服器上的頁面。',
    '常見漏洞與暴露（CVE）',
    '請稍等......我們只是確認你的網站連線安全。這有助於保護我們的網站和用戶。'
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
    return {response:'這篇文章比較不同實作的效能與技術取捨，並對實驗方法和結果提出了具體分析。'};
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


test('retries a truncated note and summarizes every part of a long submission',async()=>{
  const calls=[];
  const note='第一段整理出的要點';
  const summary='這篇文章分析資料庫基準測試的效能差異，以及針對特定工作負載最佳化的適用範圍。';
  const env={AI:{run:async (_model,args)=>{
    const input=JSON.parse(args.messages[1].content);
    calls.push({input,budget:args.max_tokens});
    assert.equal(args.response_format,undefined);
    if(input.part===1 && args.max_tokens===380)
      return {choices:[{finish_reason:'length',message:{content:'不完整片段'}}]};
    if(input.part===1)return {choices:[{finish_reason:'stop',message:{content:note}}]};
    if(input.part===2)return {response:'第二段整理出的要點'};
    assert.match(input.article,/第一段整理出的要點[\s\S]*第二段整理出的要點/);
    return {response:summary};
  }}};
  const item={title:'資料庫基準測試',url:'https://example.org/post'};
  assert.equal(await summarizeSubmittedArticle(env,item,'長段落原文。'.repeat(2200)),summary);
  assert.deepEqual(calls.filter(c=>c.input.part===1).map(c=>c.budget),[380,760]);
});

test('does not return a summary that remains truncated after retry',async()=>{
  const env={AI:{run:async()=>({choices:[{finish_reason:'length',message:{
    content:'這是足夠長但被截斷的資料庫效能評估摘要，還有尚未輸出完畢的文章重點。'
  }}]})}};
  await assert.rejects(()=>summarizeSubmittedArticle(env,{title:'Article'},'原文內容。'.repeat(20)),/未回傳完整文字/);
});
