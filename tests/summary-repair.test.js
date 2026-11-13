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


test('summarizes the copied article without passing its copyright footer, bios, or comments to AI',async()=>{
  const seen=[];
  const summary='報導引述知情人士指出，輝達董事會準備開會討論執行長去留，接班人選仍未明朗。';
  const env={AI:{run:async (_model,args)=>{
    seen.push(JSON.parse(args.messages[1].content));
    return {response:summary};
  }}};
  const item={title:'Nvidia Is Preparing to Oust CEO Jensen Huang',url:'https://example.org/post'};
  const body='董事會準備開會討論執行長的去留。'.repeat(60);
  const comments='讀者留言：我猜事情另有內幕。'.repeat(1000);
  const copy=['archive.today','華爾街日報',body,'版權所有 ©2026 Dow Jones & Company',
    '作者簡介','Hide Conversation (1825)',comments,'Further Reading'].join('\n');
  assert.equal(await summarizeSubmittedArticle(env,item,copy),summary);
  assert.equal(seen.length,1);
  assert.equal(seen[0].article,['archive.today','華爾街日報',body].join('\n'));
});

test('retains a short article when a copyright line is near the top of the copy',async()=>{
  const article='Copyright ©2026 Example Publisher\n'+'文章正文包含可摘要的資料庫基準測試技術內容。'.repeat(5);
  const env={AI:{run:async (_model,args)=>{
    assert.equal(JSON.parse(args.messages[1].content).article,article);
    return {response:'這篇文章介紹資料庫基準測試，並分析實際工作負載與測試條件對效能評估的影響。'};
  }}};
  await summarizeSubmittedArticle(env,{title:'Article'},article);
});


const wsjItem={title:'Nvidia Is Preparing to Oust CEO Jensen Huang',url:'https://www.wsj.com/business/example'};
const quickSummary='輝達董事會準備召開會議討論執行長去留，報導引述知情人士稱接班人選尚未確定。';

test('uses a complete WSJ Quick Summary from a copied page without invoking AI',async()=>{
  const page=['archive.today','華爾街日報','快速摘要',quickSummary,'查看更多',
    '這是其餘文章內容。'.repeat(100),'Hide Conversation (1825)','這是留言'].join('\n');
  assert.equal(await summarizeSubmittedArticle({},wsjItem,page),quickSummary);
});

test('excludes the truncated Quick Summary and retries commentary using only article prose',async()=>{
  const longLine='這段報導介紹輝達董事會預計討論執行長去留，並引述知情人士說明會議時間及接班人選尚未確定。'.repeat(2);
  const page=['快速摘要','這一段是截斷的預覽…','查看更多','首頁','體育','科技','政治','時尚','更多',
    longLine,'',longLine,'世界','視訊','關於','條款','隱私','訂閱'].join('\n');
  let calls=0;
  const env={AI:{run:async (_model,args)=>{
    assert.equal(JSON.parse(args.messages[1].content).article,longLine+'\n\n'+longLine);
    return {response:++calls===1?'根據提供的文本內容，該資訊存在矛盾。段落 1 指稱董事會將開會。':quickSummary};
  }}};
  assert.equal(await summarizeSubmittedArticle(env,wsjItem,page),quickSummary);
  assert.equal(calls,2);
});


test('times out AI generation while keeping the pasted text available',async()=>{
  const env={AI:{run:()=>new Promise(()=>{})}};
  await assert.rejects(
    ()=>summarizeSubmittedArticle(env,{title:'Article'},'原文內容。'.repeat(20),5),
    /摘要逾時.*本機草稿/
  );
});


test('removes a model-added summary heading before returning the prose',async()=>{
  const env={AI:{run:async()=>({response:'**以下是這篇文章的摘要：**\n\n'+quickSummary})}};
  assert.equal(await summarizeSubmittedArticle(env,{title:'Article'},'原文內容。'.repeat(20)),quickSummary);
});
