import { CLASSIFIER_MODEL } from './classify.js';
import { isSummaryCommentary, needsSummaryRepair } from './metadata.js';
export { needsSummaryRepair } from './metadata.js';
import { get } from './data.js';

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

const quickHeading=/^\s*(?:#{1,6}\s+)?(?:Quick Summary|Key Points|快速摘要|重點摘要|要點)\s*[:：]?\s*$/i;
const quickEnd=/^\s*(?:See more|Read more|Show more|See less|Show less|What[’']s this\?|查看更多|檢視更多|顯示更多|查看完整摘要|收合|顯示較少)\s*$/i;

function wsjSummaryBlock(source,url) {
  if(!/^https:\/\/(?:www\.)?wsj\.com\//i.test(url||''))return null;
  const lines=source.split('\n');
  const start=lines.findIndex(line=>quickHeading.test(line));
  if(start<0 || lines.slice(0,start).join('\n').length>6000)return null;
  const end=lines.findIndex((line,i)=>i>start && i<=start+12 && quickEnd.test(line));
  if(end<0)return null;
  const text=lines.slice(start+1,end).map(line=>line.trim()).filter(Boolean).join('\n');
  const complete=text.length>=25 && text.length<=900 && /[。！？.!?][”"’）)]?$/.test(text) &&
    !/(?:…|\.{3})\s*(?:$|\n)/.test(text) && !needsSummaryRepair(text);
  return {summary:complete?text:'',body:lines.slice(end+1).join('\n').trimStart()};
}

export function wsjQuickSummary(source,url) {
  return wsjSummaryBlock(source,url)?.summary || '';
}

function trimCopiedPage(source) {
  const footer = /^(?:版權所有\s*©|Copyright\s+©|(?:Hide|Show) Conversation\s*\([\d,.]+[kK]?\)|Conversation\s*[\d,.]+[kK]?\s+Comments|#{1,6}\s*\d[\d,.]*\s+(?:comments?|則留言|條留言)\s*[:：]?\s*$)/im;
  const match=[...source.matchAll(new RegExp(footer,'gim'))].find(m=>source.slice(0,m.index).trim().length>=600);
  const beforeFooter=match
    ? source.slice(0,match.index).trimEnd() : source;
  const lines=beforeFooter.split('\n').map(line=>line.trim()).filter(Boolean);
  const isProse=line=>line.length>=65 && /[。！？.!?]/.test(line);
  const isMenu=lines=>lines.length>=6 && lines.every(line=>line.length<=32 && !/[。！？!?]|[.]$/.test(line));
  const first=lines.findIndex(isProse);
  const last=lines.findLastIndex(isProse);
  if(first<0 || last<=first)return beforeFooter;
  const start=isMenu(lines.slice(0,first))?first:0;
  const end=isMenu(lines.slice(last+1))?last+1:lines.length;
  if(start===0 && end===lines.length)return beforeFooter;
  const rawLines=beforeFooter.split('\n');
  const firstLine=start?rawLines.findIndex(line=>line.trim()===lines[first]):0;
  const lastLine=end===lines.length?rawLines.length:rawLines.findLastIndex(line=>line.trim()===lines[last])+1;
  return rawLines.slice(firstLine,lastLine).join('\n').trim();
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

export async function summarizeSubmittedArticle(env,item,text,timeoutMs=25000) {
  const source=String(text||'').replace(/\r\n?/g,'\n').trim();
  if(source.length>150000)throw Error('原文超過 15 萬字元，請分段精簡後再貼入');
  if(source.length>=60 && needsSummaryRepair(source) && source.length<300)throw Error('貼入的內容疑似仍為封鎖或驗證畫面');
  const quick=wsjSummaryBlock(source,item.url);
  if(quick?.summary)return quick.summary;
  const article=trimCopiedPage(quick?.body ?? source);
  if(article.length<60)throw Error('原文不足 60 字，請貼入文章主要內文');
  if(!env.AI)throw Error('Workers AI 尚未設定');
  let timeout;
  try {
    return await Promise.race([
      summarizeArticleBody(env,item,article),
      new Promise((_,reject)=>{
        timeout=setTimeout(()=>reject(Error('重新摘要逾時，原文仍保留在本機草稿，請稍後重試')),timeoutMs);
      })
    ]);
  } finally {clearTimeout(timeout);}
}

function stripSummaryPreamble(text) {
  return text.replace(/^(?:#{1,6}\s*|\*{1,2})?(?:以下(?:是|為).{0,18}(?:摘要|重點)|(?:文章|新聞|報導|繁體中文)?摘要|Summary|Here(?:'s| is) (?:the|a) summary)\s*[*：:\s]+/i,'').trim();
}

async function summarizeArticleBody(env,item,article) {
  const title=item.title_original||item.title;
  const parts=splitByLength(article);
  let material=article;
  if(parts.length>1){
    const extracted=new Array(parts.length);
    for(let i=0;i<parts.length;i+=3){
      const slice=parts.slice(i,i+3);
      const values=await Promise.all(slice.map((part,j)=>infer(env,
        '你是繁體中文文章筆記員。僅根據提供的原文片段，以不超過 200 個中文字整理最重要的具體要點，保留關鍵數字及技術細節。只整理文章正文。略過作者簡介、讀者留言、導覽、推薦文章及網頁存檔介面。勿添加原文沒有的事實。只輸出筆記文字。',
        JSON.stringify({title,part:i+j+1,total:parts.length,text:part}),380)));
      values.forEach((value,j)=>{extracted[i+j]=value;});
    }
    material=extracted.map((x,i)=>'段落 '+(i+1)+'：'+x).join('\n');
  }
  const instructions=
    '以台灣繁體中文，用兩到三句話摘要文章。第一句直接寫主要事件或發現，不加標題、前言或自我說明。保留必要的數字及限制，清楚歸屬引述與尚未證實的指控。若輸入有多個片段，它們都來自同一篇文章。只依正文摘要，忽略留言、作者簡介、導覽、廣告及推薦文章。';
  const input=JSON.stringify({title,url:item.url,article:material});
  let summary=stripSummaryPreamble(await infer(env,instructions,input,600));
  if(isSummaryCommentary(summary))
    summary=stripSummaryPreamble(await infer(env,instructions+'只寫文章本身的主事件與要點。',input,600));
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
