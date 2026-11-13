import { CLASSIFIER_MODEL } from './classify.js';
import { invalidSummary } from './metadata.js';
import { get } from './data.js';

// Narrow signals only: do not confuse articles ABOUT JavaScript, authentication,
// or CAPTCHA with their own failed page-load message.
export function needsSummaryRepair(summary) {
  const s=String(summary||'').trim();
  return invalidSummary(s) ||
    /^(?:常見漏洞與暴露(?:（CVE）)?|no description|not found)$/i.test(s) ||
    /(?:Google 系統偵測到來自|解開 CAPTCHA 後|請啟用 JS 並關閉|繼續操作，請登入你的 Reddit 帳號|你沒有權限存取這個伺服器|如需協助，請造訪 help\.ft\.com|請確保您的瀏覽器支援 JavaScript 和 Cookies)/i.test(s);
}

export async function repairCandidates(db) {
  const result=await db.prepare('SELECT id,stage,title,title_original,title_zh,url,redirect_url,summary,created_at FROM bookmarks ORDER BY created_at ASC,id ASC').all();
  const items=result.results.filter(x=>needsSummaryRepair(x.summary));
  return {total:items.length,items};
}

async function infer(env, system, user, maxTokens) {
  const messages=[{role:'system',content:system},{role:'user',content:user}];
  for(const max_tokens of [maxTokens,maxTokens*2]){
    const result=await env.AI.run(CLASSIFIER_MODEL,{
      messages,chat_template_kwargs:{enable_thinking:false},temperature:0,max_tokens
    });
    const choice=result?.choices?.[0];
    const content=choice?.message?.content ?? result?.response;
    if(choice?.finish_reason!=='length' && typeof content==='string' && content.trim())
      return content.trim();
  }
  throw Error('摘要模型未回傳完整文字，原文仍保留在本機草稿');
}

function splitByLength(value,max=11000) {
  const segments=[];
  let rest=value;
  while(rest.length>max){
    let cut=rest.lastIndexOf('\n',max);
    if(cut<max/2) cut=rest.lastIndexOf(' ',max);
    if(cut<max/2) cut=max;
    segments.push(rest.slice(0,cut).trim());
    rest=rest.slice(cut).trimStart();
  }
  if(rest)segments.push(rest);
  return segments;
}

export async function summarizeSubmittedArticle(env,item,text) {
  if(!env.AI)throw Error('Workers AI 尚未設定');
  const source=String(text||'').replace(/\r\n?/g,'\n').trim();
  if(source.length<60)throw Error('原文不足 60 字，請貼入文章主要內文');
  if(source.length>150000)throw Error('原文超過 15 萬字元，請分段精簡後再貼入');
  if(needsSummaryRepair(source) && source.length<300)throw Error('貼入的內容疑似仍為封鎖或驗證畫面');
  const title=item.title_original||item.title;
  const parts=splitByLength(source);
  let material=source;
  if(parts.length>1){
    const extracted=new Array(parts.length);
    for(let i=0;i<parts.length;i+=3){
      const slice=parts.slice(i,i+3);
      const values=await Promise.all(slice.map((part,j)=>infer(env,
        '你是繁體中文文章筆記員。僅根據提供的原文片段，以不超過 200 個中文字整理最重要的具體要點，保留關鍵數字及技術細節。若是留言，區分發言者與主張。勿添加原文沒有的事實。只輸出筆記文字。',
        JSON.stringify({title,part:i+j+1,total:parts.length,text:part}),380)));
      values.forEach((value,j)=>{extracted[i+j]=value;});
    }
    material=extracted.map((x,i)=>'段落 '+(i+1)+'：'+x).join('\n');
  }
  const summary=await infer(env,
    '請以台灣繁體中文為文章撰寫忠實摘要，約 100 至 220 個中文字。以文章正文的主張、重要細節與結論為主。若有留言，只補充與主題直接相關的澄清，並標明是誰的說法。保留關鍵數字、技術名稱及限制。不要套話、不要虛構事實、不要引用無關網頁導航或廣告。只輸出摘要正文，可使用 Markdown。',
    JSON.stringify({title,url:item.url,article:material}),600);
  if(summary.length<30 || summary.length>1500 || needsSummaryRepair(summary))
    throw Error('生成的摘要未通過品質檢查，原文仍保留在本機草稿');
  return summary;
}

export async function commitArticleSummary(env,id,text) {
  const item=await get(env.DB,id,true);
  if(!item)throw Error('書籤不存在');
  if(!needsSummaryRepair(item.summary))throw Error('摘要已被更新，為避免覆寫請重新整理清單');
  const summary=await summarizeSubmittedArticle(env,item,text);
  const old=item.summary??null;
  const update=await env.DB.prepare(
    'UPDATE bookmarks SET summary=?,updated_at=? WHERE id=? AND ((summary IS NULL AND ? IS NULL) OR summary=?)'
  ).bind(summary,new Date().toISOString(),id,old,old).run();
  if(!update.meta.changes)throw Error('摘要已被其他操作更新，請重新整理');
  return {id,summary,saved:true};
}

export async function readSubmittedContent(req) {
  if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw Error('需要 JSON 格式');
  const declared=Number(req.headers.get('Content-Length')||0);
  if(declared>500000)throw Error('文章資料過大');
  const text=await req.text();
  if(text.length>300000)throw Error('文章資料過大');
  const json=JSON.parse(text);
  if(!/^[0-9a-f-]{36}$/i.test(String(json?.id||'')))throw Error('書籤 ID 無效');
  if(typeof json.content!=='string')throw Error('請先貼入原文內容');
  return json;
}
