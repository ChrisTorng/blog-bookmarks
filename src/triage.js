import { CLASSIFIER_MODEL } from './classify.js';
import { needsSummaryRepair } from './metadata.js';

export const TRIAGE_VERSION='triage-2026-11-19-v2';
const key=id=>TRIAGE_VERSION+':'+id;
const dimensions=['learning','awareness','depth','durability','novelty','fit'];
const weights={learning:.20,awareness:.27,depth:.11,durability:.08,novelty:.16,fit:.18};
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
 const dimensions={learning:50,awareness:50,depth:50,durability:50,novelty:50,fit:50};
 return {version:TRIAGE_VERSION,signature:signature(b),score:50,dimensions,flags:['閱讀障礙'],
  reason:'目前摘要缺漏或抓取到網頁程式碼，無法可靠判斷文章的資訊量與學習價值；應先嘗試取得全文，不可直接視為低價值文章。',
  basis:'insufficient',confidence:'none',summary_chars:size(b.summary),full_chars:null,
  full_words:null,read_minutes:null,assessed_at:null};
}

export function previewTriage(b){
 if(insufficientSummary(b))return insufficientResult(b);
 const title=(b.title_original||b.title||'').toLowerCase();
 const summary=String(b.summary||''),body=title+' '+summary;
 const ai=/\b(?:AI|LLM|GPT[-\s]?\d|Qwen|Gemini|Claude|Anthropic|OpenAI|DeepSeek|Mistral|Llama|Kimi|Copilot|Codex|MoE|Ollama|transformer|machine learning)\b|人工智慧|語言模型|模型發表|模型發布|AI模型/i.test(body);
 const history=/\b(?:archaeolog|artifact|ancient|histori|centur|medieval|excavation|fossil|old manuscript)\b|歷史|考古|古代|出土|史料|化石/i.test(body);
 const science=/\b(?:science|research|physics|chemistry|biology|astronomy|mathematics|proof|discovery)\b|科學|研究|化學|物理|數學|實驗|發現/i.test(body);
 const method=/\b(?:how to|reverse engineer|explained|tutorial|benchmark|analysis|architecture|deep dive)\b|原理|實作|架構|推導|分析|方法|教學|比較/i.test(body);
 const event=/\b(?:outage|downtime|brief disruption|service restored|emergency alert|temporarily unavailable)\b|停機|服務中斷|臨時故障|緊急公告/i.test(body);
 const transient=event&&!ai&&!history&&!science&&!method;
 const len=size(summary);
 const d={
  learning:clamp(method?81:history?74:science?80:ai?69:60),
  awareness:clamp(ai?93:history?86:science?80:transient?25:64),
  depth:clamp(len<65?52:len<130?64:len<240?72:78),
  durability:clamp(transient?28:ai?68:history?88:science?84:72),
  novelty:clamp(ai?86:history?82:science?79:transient?42:64),
  fit:clamp(ai?91:history?85:science?83:transient?32:67)
 };
 const flags=transient?['時事過期']:[];
 const reason=ai?'AI 新模型、產品或產業動態屬於重要追蹤資訊，即使只包含公告，也可能值得了解與收錄。'
  :history?'考古、史料或歷史新發現本身具探索價值，不能只因缺乏技術實作就扣分。'
  :science?'研究與科學發現可帶來新知，值得進一步確認原文的證據與內容。'
  :transient?'偏向短效事件通報，需確認是否有可長期學習的根因或獨特資訊。'
  :method?'有原理或方法的線索，應優先確認實作細節。'
  :'摘要資訊不足以確定讀完的價值；仍應考慮獨特事實與個人興趣。';
 return {version:TRIAGE_VERSION,score:Math.round(dimensions.reduce((n,k)=>n+d[k]*weights[k],0)),
  dimensions:d,flags,reason,basis:'rules',confidence:'low',summary_chars:len,
  full_chars:null,full_words:null,read_minutes:null,assessed_at:null};
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
  const sql="SELECT title_original,title,substr(summary,1,210) summary FROM bookmarks WHERE stage=? ORDER BY updated_at DESC LIMIT 18";
  const [negative,positive]=await Promise.all([
    db.prepare(sql).bind(2).all(),
    db.prepare("SELECT title_original,title,substr(summary,1,210) summary FROM bookmarks WHERE stage IN (3,4) ORDER BY CASE WHEN title LIKE '%Qwen4%' OR title LIKE '%Gemini 4 Carbon%' OR title LIKE '%Nvidia 接下來%' OR title LIKE '%南韓將發布%' THEN 0 ELSE 1 END, updated_at DESC LIMIT 26").all()
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
    '你是 ChrisTorng 學習天地個人書籤預篩助手：預測使用者閱讀後可能公開或推薦的傾向，而不是文章的普遍品質或技術深度評分。',
    '此使用者已經先在 BetaCats 看標題摘要，只有感興趣的才按星號成為書籤；D1 不公開是第二關被淘汰，數量少不能代表使用者只對程式技術有興趣。沒有按星號的記錄以前未保存，不可臆造負樣本。',
    '特別重要的實際反例：Qwen4-Max 舊評26分、Gemini 4 Carbon 29分、南韓高考31分、劍橋詞典 Human 33分、Nvidia 34分，使用者後來全部公開。這證明 AI 新品公告與公司技術動向本身值得知道；新聞、語言、人文現象亦可能值得公開。',
    '強調 AI 模型與產品公告（Qwen、Gemini、GPT、Claude 等），即使沒有演算法細節，只要是新版本、能力比較或重要資訊，就應給高 awareness 和 fit。歷史、考古、新史料、自然科學也是高度興趣領域。不得因為沒有程式碼或教學而判低分。',
    '短效時事如服務中斷、緊急故障資訊若已不需要及時知道、沒有根因、分析或獨特見解，才降低價值。資安漏洞若附有可學方法可以高分。不要一概視為事件新聞過期。',
    '遊戲若有新觀念、設計方法或創意也值得了解；只能體驗遊戲但手機無法看且無其他資訊，才考慮較低分。外語不是問題。',
    '評六個 0~100 分面向：learning=原理/方法/新知的學習，awareness=值得及時知道的新模型/新發現/趨勢/資訊價值，depth=具體資訊內容，durability=長期留存價值，novelty=新事實與獨特性（公告也可能有），fit=使用者個人興趣/學習天地適合度。',
    '沒有全文時不能把摘要字數當成全文字數，也不得說正文很短。flags 僅使用「時事過期、內容過短、學習價值不足、資訊重複、展示／遊戲、閱讀障礙、其他」最多兩個；內容過短只能在有全文證據時標記。',
    '繁體中文 reason 30~70 字，具體說明學到什麼或可能不值得讀的原因。只輸出 JSON：{"items":[{"id":"...","learning":70,"awareness":75,"depth":60,"durability":70,"novelty":70,"fit":80,"flags":[],"reason":"..."}]}。',
    '絕對不可修改書籤公開狀態。'
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
