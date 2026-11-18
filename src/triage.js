import { CLASSIFIER_MODEL } from './classify.js';
import { needsSummaryRepair } from './metadata.js';

export const TRIAGE_VERSION='triage-2026-11-19-v1';
const key=id=>TRIAGE_VERSION+':'+id;
const dimensions=['learning','depth','durability','novelty','fit'];
const weights={learning:.34,depth:.26,durability:.18,novelty:.14,fit:.08};
const candidatesSql="SELECT b.id,b.title,b.title_original,b.title_zh,b.summary,b.url,b.redirect_url,b.created_at,b.updated_at,b.stage,b.deferred,s.value AS saved FROM bookmarks b LEFT JOIN bookmark_settings s ON s.key=?||b.id WHERE b.stage IN (0,1)";
const sourceText=b=>[b.title,b.title_original,b.summary,b.url,b.redirect_url].join('\n');
function signature(b) {
  let h=2166136261;
  for(const c of sourceText(b)){h=Math.imul(h^c.charCodeAt(0),16777619);}
  return (h>>>0).toString(16);
}
const clamp=v=>Math.max(0,Math.min(100,Math.round(Number(v)||0)));
const size=s=>[...String(s||'')].length;
const reasons=['時事過期','內容過短','學習價值不足','資訊重複','展示／遊戲','閱讀障礙','其他'];
function insufficientSummary(b) {
 const s=String(b.summary||'').trim();
 return needsSummaryRepair(s) ||
  /(?:僅包含(?:網頁)?技術代碼|沒有(?:任何)?(?:文章)?正文|無法摘要其主要事件|未提供(?:任何)?文章正文|無法取得文章正文)/.test(s);
}
function insufficientResult(b) {
 const dimensions={learning:50,depth:50,durability:50,novelty:50,fit:50};
 return {version:TRIAGE_VERSION,signature:signature(b),score:50,dimensions,flags:['閱讀障礙'],
  reason:'目前摘要缺漏或抓取到網頁程式碼，無法可靠判斷文章的資訊量與學習價值；應先嘗試取得全文，不可直接視為低價值文章。',
  basis:'insufficient',confidence:'none',summary_chars:size(b.summary),full_chars:null,
  full_words:null,read_minutes:null,assessed_at:null};
}

export function previewTriage(b){
  if(insufficientSummary(b))return insufficientResult(b);
  const title=(b.title_original||b.title||'').toLowerCase();
  const summary=String(b.summary||'');
  const length=size(summary);
  const event=/(?:outage|incident|downtime|breaking|statement|announces?|press release|breach|resigns?|funding|raised|quarterly|earnings|launches|reports|acquired|status|停機|故障|異常|公告|聲明|收購|融資|財報|爆發|調查中|停飛)/i.test(title+' '+summary.slice(0,180));
  const promo=/(?:show hn:|play|game|demo|landing page|pricing|signup|sign up|下載|互動遊戲|小遊戲|介紹一款)/i.test(title);
  const technical=/(?:how to|inside|reverse engineer|explained|tutorial|benchmark|analysis|architecture|deep dive|research|實作|原理|架構|推導|實驗|研究|分析|逆向|方法|教學|證明|比較|資料)/i.test(title+' '+summary);
  const short=length<65;
  const ageDays=Math.max(0,(Date.now()-Date.parse(b.created_at||0))/86400000);
  const dimensions={
    learning:clamp(technical?76:promo?48:event?38:62),
    depth:clamp(short?32:length<105?55:length<200?68:76),
    durability:clamp(event?Math.max(10,55-ageDays*4):78),
    novelty:clamp(event?45:promo?55:67),
    fit:clamp(technical?75:promo?56:60)
  };
  if(needsSummaryRepair(summary))dimensions.depth=40;
  const flags=[];
  if(event)flags.push('時事過期');
  // A short summary is not evidence that the original article is short.
  if(promo)flags.push('展示／遊戲');
  if(needsSummaryRepair(summary))flags.push('閱讀障礙');
  if(!flags.length)flags.push(technical?'其他':'學習價值不足');
  const score=Math.round(Object.keys(weights).reduce((s,k)=>s+dimensions[k]*weights[k],0));
  return {version:TRIAGE_VERSION,score,dimensions,flags,reason:short?'摘要很短，無法確認正文是否有額外深度；建議先看原文。':event?'事件導向內容，需確認是否包含可長期參考的分析。':promo?'偏向介紹或展示，應檢查是否有實作細節、原理或可重用的方法。':technical?'摘要已有技術線索；暫時不宜直接淘汰。':'僅依摘要初步評估；完整內容可能改變結果。',basis:'rules',confidence:'low',summary_chars:length,full_chars:null,full_words:null,read_minutes:null,assessed_at:null};
}
function current(b){
  try{
    const x=JSON.parse(b.saved);
    return x.version===TRIAGE_VERSION && x.signature===signature(b) ? x : null;
  }catch{return null;}
}
export async function triageList(db,includeDeferred=false){
  const sql=candidatesSql+(includeDeferred?'':' AND b.deferred=0')+' ORDER BY b.created_at ASC,b.id ASC LIMIT 500';
  const data=await db.prepare(sql).bind(TRIAGE_VERSION+':').all();
  const items=data.results.map(x=>{
    const {saved,...b}=x;
    return {...b,analysis:insufficientSummary(b)&&current(x)?.basis!=='fulltext' ? insufficientResult(b) : (current(x)||previewTriage(x)),assessed:!!current(x)};
  });
  return {version:TRIAGE_VERSION,total:items.length,assessed:items.filter(x=>x.assessed).length,items};
}
async function history(db){
  const sql="SELECT title_original,title,substr(summary,1,210) summary FROM bookmarks WHERE stage=? ORDER BY updated_at DESC LIMIT 12";
  const [negative,positive]=await Promise.all([
    db.prepare(sql).bind(2).all(),
    db.prepare("SELECT title_original,title,substr(summary,1,210) summary FROM bookmarks WHERE stage IN (3,4) ORDER BY updated_at DESC LIMIT 14").all()
  ]);
  const normalize=rows=>rows.results.map(x=>({title:x.title_original||x.title,summary:x.summary}));
  return {not_public:normalize(negative),published:normalize(positive)};
}
function parseAnswer(output,items,extra={}){
  const content=output?.choices?.[0]?.message?.content??output?.response;
  const parsed=typeof content==='string'?JSON.parse(content):content;
  if(!Array.isArray(parsed?.items))throw Error('AI 未回傳完整評分清單');
  const byId=new Map(parsed.items.map(x=>[x.id,x]));
  return items.map(b=>{
    const x=byId.get(b.id);
    if(!x || dimensions.some(k=>!Number.isFinite(Number(x[k]))))throw Error('AI 評分項目不完整');
    const d=Object.fromEntries(dimensions.map(k=>[k,clamp(x[k])]));
    const body=extra[b.id];
    if(!body && insufficientSummary(b))return insufficientResult(b);
    const flags=[...new Set((Array.isArray(x.flags)?x.flags:[]).filter(f=>reasons.includes(f)&&(f!=='內容過短'||!!body)))].slice(0,3);
    const score=Math.round(dimensions.reduce((sum,k)=>sum+d[k]*weights[k],0));
    return {version:TRIAGE_VERSION,signature:signature(b),score,dimensions:d,flags,
      reason:String(x.reason||'').slice(0,280)||'沒有提供具體理由',basis:body?'fulltext':'summary',
      confidence:body?'medium':'low',summary_chars:size(b.summary),
      full_chars:body?.chars??null,full_words:body?.words??null,
      read_minutes:body?.minutes??null,
      assessed_at:new Date().toISOString()};
  });
}
export async function scoreTriage(env,ids,{fullText=null}={}){
  if(!env.AI)throw Error('Workers AI 尚未設定');
  if(!Array.isArray(ids)||!ids.length||ids.length>6||ids.some(x=>!/^[0-9a-f-]{36}$/i.test(String(x))))throw Error('一次最多評估 6 篇有效書籤');
  const unique=[...new Set(ids)];
  const b=await env.DB.prepare(candidatesSql+' AND b.id IN ('+unique.map(()=>'?').join(',')+')').bind(TRIAGE_VERSION+':',...unique).all();
  if(b.results.length!==unique.length)throw Error('書籤狀態已變更，請重新載入');
  const full={};
  if(fullText){
    if(unique.length!==1)throw Error('全文評估一次僅限一篇');
    const text=String(fullText.text||'');
    if(text.length<300)throw Error('文章正文不足，無法可靠評估全文');
    full[unique[0]]=fullText;
  }
  const pending=b.results.filter(item=>fullText||!current(item));
  if(!pending.length)return {updated:[],skipped:unique.length};
  const examples=await history(env.DB);
  const system=[
    '你是「ChrisTorng 學習天地」的個人閱讀預篩助理，目標是判斷是否值得進一步讀原文及長期收錄，不是評估文章政治立場、流行程度或分類標籤。',
    '負面與正面歷史決策只是弱訊號，不公開也可能是主題不適用、已讀過或媒體限制，不能當成普遍品質標籤。不要因為語言非中文、主題陌生、不是程式技術而扣分。',
    '遊戲或互動展示若有演算法、設計、實作原理仍可高分；如果只有遊戲操作／登入才能體驗，且缺乏技術細節，才將閱讀成本列入理由。',
    '事件新聞、營運狀態、企業聲明若僅是短暫通知且沒有技術根因／分析／可重用方法，應降低長期價值；安全漏洞若附 exploit、根因、補救分析可高分。',
    '摘要短不等於正文短；若未提供全文，不可斷言全文字數很少。若有競爭或獨特的新事實，短文也有價值。',
    '每篇評五項各 0~100，分高代表值得讀：learning=可學習的原理／方法，depth=資訊量與具體性，durability=超越短暫時事的持久性，novelty=與一般公告或重複報導相比的新知增量，fit=適合個人探索式學習天地（跨領域、科學、音樂、歷史、技術均可）。',
    'flags 僅使用「時事過期、內容過短、學習價值不足、資訊重複、展示／遊戲、閱讀障礙、其他」，最多兩個且必須有明確依據。「時事過期」指內容高度依賴即時性而非單純事件發生在過去；「內容過短」需要有全文證據，否則不要標。',
    '繁體中文 reason 30~70 字，說明最主要的價值／疑慮，避免泛泛形容或臆測。輸出純 JSON：{"items":[{"id":"...","learning":50,"depth":50,"durability":50,"novelty":50,"fit":50,"flags":["其他"],"reason":"..."}]}',
    '不得自動更動任何書籤公開狀態。'
  ].join('\n');
  const content={
    current_date:new Date().toISOString().slice(0,10),
    historical_examples:examples,
    candidates:pending.map(x=>({
      id:x.id,title:x.title_original||x.title,title_zh:x.title_zh||x.title,
      url:x.redirect_url||x.url,created_at:x.created_at,summary:String(x.summary||'').slice(0,1500),
      full_text:full[x.id]?String(full[x.id].text).slice(0,9500):undefined
    }))
  };
  const out=await env.AI.run(CLASSIFIER_MODEL,{
    messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(content)}],
    response_format:{type:'json_object'},chat_template_kwargs:{enable_thinking:false},
    temperature:0,max_tokens:2300
  });
  const results=parseAnswer(out,pending,full);
  await env.DB.batch(results.map((x,i)=>env.DB.prepare(
    'INSERT INTO bookmark_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
  ).bind(key(pending[i].id),JSON.stringify(x),x.assessed_at)));
  return {updated:results.map((r,i)=>({id:pending[i].id,analysis:r})),skipped:unique.length-pending.length};
}
function safeAddress(address){
  try{
    const u=new URL(address);
    if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
    const host=u.hostname.toLowerCase().replace(/\.$/,'');
    if(!host.includes('.')||host.includes(':')||/^[0-9.]+$/.test(host)||host==='localhost'||/\.(?:local|internal|test|localhost|invalid)$/.test(host))return false;
    return true;
  }catch{return false;}
}
const decodeHtml=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|ndash|mdash);/gi,(all,v)=>{
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—'};
  if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
  return named[v.toLowerCase()]||all;
});
export function extractArticle(html){
  const body=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||'';
  if(!body)return '';
  const clean=body.replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|noscript|svg|nav|aside|header|footer|form)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<\/(?:p|div|li|h[1-6]|section|br|tr|blockquote)>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
  return decodeHtml(clean).replace(/[ \t]+/g,' ').replace(/\n(?:\s*\n)+/g,'\n').trim();
}
export function countText(text){
  const chars=[...text].filter(c=>!/\s/.test(c)).length;
  const cjk=(text.match(/[\u3400-\u9fff\u3040-\u30ff]/g)||[]).length;
  const english=(text.match(/[a-zA-Z0-9]+(?:['-][a-zA-Z0-9]+)*/g)||[]).length;
  const words=cjk+english;
  const minutes=Math.max(1,Math.round((cjk/280+english/180)*1.1));
  return {chars,words,minutes};
}
export async function inspectTriage(env,id){
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('書籤 ID 無效');
  const row=await env.DB.prepare('SELECT id,url,redirect_url,title,summary FROM bookmarks WHERE id=? AND stage IN (0,1)').bind(id).first();
  if(!row)throw Error('找不到待處理書籤');
  const url=row.redirect_url&&safeAddress(row.redirect_url)?row.redirect_url:row.url;
  if(!safeAddress(url))return {available:false,reason:'來源不是可安全擷取的 HTTPS 文章網址，請複製正文手動貼入。'};
  let response;
  try{
    response=await fetch(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(7500)});
  }catch{return {available:false,reason:'來源站連線逾時或拒絕伺服器擷取；可改用複製原文。'};}
  if(!response.ok||!(response.headers.get('Content-Type')||'').toLowerCase().includes('text/html'))
    return {available:false,reason:'來源站未提供可擷取的 HTML 正文（HTTP '+response.status+'）。'};
  const declared=Number(response.headers.get('Content-Length')||0);
  if(declared>1300000)return {available:false,reason:'來源頁面過大，無法確認全文完整性。'};
  let html;
  try{html=await response.text();}catch{return {available:false,reason:'擷取正文失敗。'};}
  if(html.length>1300000)return {available:false,reason:'來源頁面過大，無法確認全文完整性。'};
  const article=extractArticle(html);
  if(article.length<300||needsSummaryRepair(article.slice(0,300)))
    return {available:false,reason:'未找到可信的文章正文（可能是登入、驗證、影片或互動網站）。'};
  const stats=countText(article);
  return {available:true,source:'web-html',...stats,text:article.slice(0,50000)};
}
